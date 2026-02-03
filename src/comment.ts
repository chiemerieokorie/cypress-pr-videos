import * as core from '@actions/core'
import * as github from '@actions/github'
import type { UploadResult } from './upload.js'

const COMMENT_MARKER = '<!-- cypress-pr-videos -->'

function buildCommentBody(
  header: string,
  results: UploadResult[],
  expirySeconds: number
): string {
  const expiryHours = Math.round(expirySeconds / 3600)
  const rows = results
    .map(r => {
      // Show just the relative spec name
      const specName = r.spec.replace(/^cypress\/e2e\//, '')
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

export async function postOrUpdateComment(
  token: string,
  results: UploadResult[],
  header: string,
  expirySeconds: number
): Promise<void> {
  if (results.length === 0) return

  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const prNumber = github.context.payload.pull_request?.number

  if (!prNumber) {
    core.warning('No pull request context found. Skipping comment.')
    return
  }

  const body = buildCommentBody(header, results, expirySeconds)

  try {
    // Search for existing comment
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100
    })

    const existing = comments.find(
      c => c.body?.includes(COMMENT_MARKER) ?? false
    )

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

export { COMMENT_MARKER, buildCommentBody }
