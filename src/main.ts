import * as core from '@actions/core'
import * as github from '@actions/github'
import { getChangedSpecs } from './diff.js'
import { uploadVideos } from './upload.js'
import type { UploadConfig } from './upload.js'
import { postOrUpdateComment } from './comment.js'

export async function run(): Promise<void> {
  try {
    // Check for fork PR
    const pr = github.context.payload.pull_request
    if (!pr) {
      core.info('Not a pull_request event. Skipping.')
      return
    }

    if (pr.head?.repo?.fork) {
      core.info('Skipping: fork PRs not supported.')
      return
    }

    // Read inputs
    const token = core.getInput('github-token', { required: true })
    const specPattern = core.getInput('spec-pattern')
    const videoDir = core.getInput('video-dir')
    const commentHeader = core.getInput('comment-header')
    const urlExpirySeconds = parseInt(
      core.getInput('url-expiry-seconds'),
      10
    )
    const maxConcurrent = parseInt(
      core.getInput('max-concurrent-uploads'),
      10
    )

    const r2Config: UploadConfig = {
      accountId: core.getInput('r2-account-id', { required: true }),
      accessKeyId: core.getInput('r2-access-key-id', { required: true }),
      secretAccessKey: core.getInput('r2-secret-access-key', {
        required: true
      }),
      bucket: core.getInput('r2-bucket', { required: true }),
      videoDir,
      urlExpirySeconds,
      maxConcurrent,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      prNumber: pr.number
    }

    // Step 1: Get changed spec files
    const specs = await getChangedSpecs(token, specPattern)
    if (specs.length === 0) {
      core.info('No spec files changed in this PR, skipping.')
      core.setOutput('video-urls', '[]')
      core.setOutput('videos-uploaded', '0')
      return
    }

    // Step 2: Upload matching videos
    const results = await uploadVideos(specs, r2Config)
    if (results.length === 0) {
      core.info('No videos found on disk for changed specs, skipping.')
      core.setOutput('video-urls', '[]')
      core.setOutput('videos-uploaded', '0')
      return
    }

    // Step 3: Post or update PR comment
    await postOrUpdateComment(token, results, commentHeader, urlExpirySeconds)

    // Step 4: Set outputs
    core.setOutput('video-urls', JSON.stringify(results))
    core.setOutput('videos-uploaded', String(results.length))

    core.info(
      `Successfully uploaded ${results.length} video(s) and posted PR comment.`
    )
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
