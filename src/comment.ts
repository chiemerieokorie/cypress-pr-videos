import * as core from '@actions/core'
import * as github from '@actions/github'
import type { UploadResult } from './upload.js'

export const COMMENT_MARKER = '<!-- cypress-pr-videos -->'

/**
 * Extract a display-friendly name from a spec path.
 * Uses the last 2-3 path segments to provide context without being too verbose.
 */
function getDisplayName(specPath: string): string {
  const parts = specPath.split('/')
  // Take last 2 segments, or all if fewer
  const relevant = parts.slice(-2)
  return relevant.join('/')
}

export function buildCommentBody(
  header: string,
  results: UploadResult[],
  expirySeconds: number,
  inlineVideos: boolean = true
): string {
  const expiryHours = Math.round(expirySeconds / 3600)

  if (inlineVideos) {
    // Inline video format - displays videos directly in the comment
    const videos = results
      .map((r) => {
        const specName = getDisplayName(r.spec)
        // Use details/summary for collapsible sections with inline video
        return `<details open>
<summary><strong>${specName}</strong></summary>

${r.url}

</details>`
      })
      .join('\n\n')

    return `${COMMENT_MARKER}
${header}

${videos}

> Videos expire ${expiryHours} hours after upload.`
  } else {
    // Table format with links (original behavior)
    const rows = results
      .map((r) => {
        const specName = getDisplayName(r.spec)
        return `| \`${specName}\` | [▶️ Watch](${r.url}) |`
      })
      .join('\n')

    return `${COMMENT_MARKER}
${header}

| Spec | Video |
|---|---|
${rows}

> Videos expire ${expiryHours} hours after upload.`
  }
}

export async function postOrUpdateComment(
  token: string,
  results: UploadResult[],
  header: string,
  expirySeconds: number,
  inlineVideos: boolean = true
): Promise<void> {
  if (results.length === 0) return

  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const prNumber = github.context.payload.pull_request?.number

  if (!prNumber) {
    core.warning('No pull request context found. Skipping comment.')
    return
  }

  const body = buildCommentBody(header, results, expirySeconds, inlineVideos)

  try {
    // Search for existing comment, paginating through all comments
    let existing: { id: number } | undefined
    let page = 1

    while (!existing) {
      const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
        page
      })

      if (comments.length === 0) break

      existing = comments.find((c) => c.body?.includes(COMMENT_MARKER) ?? false)

      if (comments.length < 100) break
      page++
    }

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body
      })
      core.info(`Updated existing PR comment (id: ${existing.id})`)
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body
      })
      core.info('Created new PR comment with video links.')
    }
  } catch (err) {
    core.error(
      `Failed to post PR comment: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
