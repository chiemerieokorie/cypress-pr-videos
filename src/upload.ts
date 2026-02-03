import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ChangedSpec } from './diff.js'

export interface UploadResult {
  spec: string
  url: string
}

interface UploadConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  videoDir: string
  urlExpirySeconds: number
  maxConcurrent: number
  owner: string
  repo: string
  prNumber: number
}

function createS3Client(config: UploadConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  })
}

/**
 * Derive the spec root from the spec-pattern default or the spec path itself.
 * For "cypress/e2e/auth/login.cy.ts" the spec root is "cypress/e2e/".
 * We strip this prefix to get the relative path for the video directory.
 */
function specToVideoPath(specPath: string, videoDir: string): string {
  // Find the common spec root: everything up to and including the first
  // directory segment that contains the actual spec files.
  // Strategy: the video mirrors the path after the spec root.
  // Cypress default: spec "cypress/e2e/foo/bar.cy.ts" → video "cypress/videos/foo/bar.cy.ts.mp4"
  // The spec root is "cypress/e2e/" — we strip that and prepend videoDir.

  // Try common spec roots in order
  const specRoots = [
    'cypress/e2e/',
    'cypress/integration/',
    'src/',
    'tests/',
    'test/'
  ]

  for (const root of specRoots) {
    if (specPath.startsWith(root)) {
      const relative = specPath.slice(root.length)
      return path.join(videoDir, `${relative}.mp4`)
    }
  }

  // Fallback: use the full spec path relative to videoDir
  return path.join(videoDir, `${specPath}.mp4`)
}

async function runWithConcurrency<T, R>(
  items: T[],
  maxConcurrent: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i])
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrent, items.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results
}

export async function uploadVideos(
  specs: ChangedSpec[],
  config: UploadConfig
): Promise<UploadResult[]> {
  const client = createS3Client(config)
  const results: UploadResult[] = []

  // Map specs to video files that exist on disk
  const specsWithVideos: Array<{ spec: ChangedSpec; videoPath: string }> = []
  for (const spec of specs) {
    const videoPath = specToVideoPath(spec.path, config.videoDir)
    if (fs.existsSync(videoPath)) {
      specsWithVideos.push({ spec, videoPath })
    } else {
      core.warning(`No video found for ${spec.path} (expected ${videoPath})`)
    }
  }

  if (specsWithVideos.length === 0) {
    core.info('No video files found on disk for changed specs.')
    return []
  }

  const uploaded = await runWithConcurrency(
    specsWithVideos,
    config.maxConcurrent,
    async ({ spec, videoPath }) => {
      const relative = specToVideoPath(spec.path, '').replace(/^\//, '')
      const key = `cypress/${config.owner}/${config.repo}/pr-${config.prNumber}/${relative}`

      try {
        const body = fs.readFileSync(videoPath)
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: body,
            ContentType: 'video/mp4'
          })
        )

        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
          { expiresIn: config.urlExpirySeconds }
        )

        core.info(`Uploaded ${spec.path} → ${key}`)
        return { spec: spec.path, url }
      } catch (err) {
        core.error(
          `Failed to upload ${spec.path}: ${err instanceof Error ? err.message : String(err)}`
        )
        return null
      }
    }
  )

  for (const r of uploaded) {
    if (r) results.push(r)
  }

  return results
}

export { type UploadConfig }
