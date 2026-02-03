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

export interface UploadConfig {
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
 * Walk the video directory and collect all .mp4 files as relative paths.
 * Returns a map from the spec-derived name (path without .mp4) to the full path.
 *
 * For example, if videoDir is "cypress/videos" and contains "auth/login.cy.ts.mp4",
 * the map entry is: "auth/login.cy.ts" → "cypress/videos/auth/login.cy.ts.mp4"
 */
export function collectVideoFiles(videoDir: string): Map<string, string> {
  const videos = new Map<string, string>()

  if (!fs.existsSync(videoDir)) {
    core.warning(`Video directory does not exist: ${videoDir}`)
    return videos
  }

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.mp4')) {
        // Key: relative to videoDir, without .mp4 extension
        const relative = path.relative(videoDir, fullPath)
        const specName = relative.slice(0, -4) // strip ".mp4"
        videos.set(specName, fullPath)
      }
    }
  }

  walk(videoDir)
  return videos
}

/**
 * Given a spec path like "cypress/e2e/auth/login.cy.ts", extract the part
 * that Cypress uses for the video filename: "auth/login.cy.ts".
 *
 * Cypress strips the common ancestor of all spec files. In practice, this is
 * the specPattern root (e.g. "cypress/e2e/"). We try known roots, then fall
 * back to using just the basename segments.
 */
export function specToRelativeName(specPath: string): string {
  const knownRoots = [
    'cypress/e2e/',
    'cypress/integration/',
    'src/',
    'tests/',
    'test/'
  ]

  for (const root of knownRoots) {
    if (specPath.startsWith(root)) {
      return specPath.slice(root.length)
    }
  }

  // Fallback: use the full path (Cypress may do this for non-standard layouts)
  return specPath
}

/**
 * Match changed spec files to video files on disk, upload matches to R2,
 * and return signed URLs.
 */
export async function uploadVideos(
  specs: ChangedSpec[],
  config: UploadConfig
): Promise<UploadResult[]> {
  const client = createS3Client(config)
  const videoMap = collectVideoFiles(config.videoDir)

  if (videoMap.size === 0) {
    core.info(
      `No .mp4 files found in ${config.videoDir}. ` +
        'Ensure Cypress video recording is enabled.'
    )
    return []
  }

  core.info(`Found ${videoMap.size} video file(s) in ${config.videoDir}`)

  // Match specs to videos
  const matched: Array<{
    spec: ChangedSpec
    videoPath: string
    videoKey: string
  }> = []

  for (const spec of specs) {
    const relativeName = specToRelativeName(spec.path)

    if (videoMap.has(relativeName)) {
      matched.push({
        spec,
        videoPath: videoMap.get(relativeName)!,
        videoKey: relativeName
      })
    } else {
      core.warning(
        `No video found for ${spec.path} (looked for "${relativeName}" in ${config.videoDir})`
      )
    }
  }

  if (matched.length === 0) {
    return []
  }

  const uploaded = await runWithConcurrency(
    matched,
    config.maxConcurrent,
    async ({ spec, videoPath, videoKey }) => {
      const key = `cypress/${config.owner}/${config.repo}/pr-${config.prNumber}/${videoKey}.mp4`

      try {
        const body = fs.createReadStream(videoPath)
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

  return uploaded.filter((r): r is UploadResult => r !== null)
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
