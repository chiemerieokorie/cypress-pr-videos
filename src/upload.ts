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
 * Find a matching video for a spec path using suffix matching.
 *
 * This approach is robust across different project structures (monorepos, custom layouts)
 * because it doesn't rely on hardcoded path prefixes. Instead, it checks if the spec path
 * ends with the video's spec name.
 *
 * Example:
 *   Spec: "apps/web/cypress/e2e/auth/login.cy.ts"
 *   Video map entry: "auth/login.cy.ts" → "cypress/videos/auth/login.cy.ts.mp4"
 *   Match: spec ends with "/auth/login.cy.ts" ✓
 *
 * If multiple videos match, the longest (most specific) match wins.
 */
export function findMatchingVideo(
  specPath: string,
  videoMap: Map<string, string>
): { videoKey: string; videoPath: string } | null {
  let bestMatch: { videoKey: string; videoPath: string } | null = null
  let bestMatchLength = 0

  for (const [videoKey, videoPath] of videoMap) {
    // Check if spec path ends with the video key (with proper path boundary)
    if (
      specPath === videoKey ||
      specPath.endsWith('/' + videoKey) ||
      specPath.endsWith(path.sep + videoKey)
    ) {
      // Prefer the longest (most specific) match
      if (videoKey.length > bestMatchLength) {
        bestMatch = { videoKey, videoPath }
        bestMatchLength = videoKey.length
      }
    }
  }

  return bestMatch
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

  // Match specs to videos using suffix matching
  const matched: Array<{
    spec: ChangedSpec
    videoPath: string
    videoKey: string
  }> = []

  for (const spec of specs) {
    const match = findMatchingVideo(spec.path, videoMap)

    if (match) {
      matched.push({
        spec,
        videoPath: match.videoPath,
        videoKey: match.videoKey
      })
    } else {
      const availableVideos = Array.from(videoMap.keys()).join(', ')
      core.warning(
        `No video found for ${spec.path}. Available videos: [${availableVideos}]`
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
