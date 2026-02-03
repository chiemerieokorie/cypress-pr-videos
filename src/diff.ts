import * as core from '@actions/core'
import * as github from '@actions/github'
import { minimatch } from 'minimatch'

export interface ChangedSpec {
  /** Full path as it appears in the repo, e.g. "cypress/e2e/auth/login.cy.ts" */
  path: string
}

/**
 * Fetch the list of files changed in the PR and filter to those matching
 * the spec-pattern glob.
 */
export async function getChangedSpecs(
  token: string,
  specPattern: string
): Promise<ChangedSpec[]> {
  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const prNumber = github.context.payload.pull_request?.number

  if (!prNumber) {
    core.warning('No pull request context found. Skipping.')
    return []
  }

  const files: ChangedSpec[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: perPage,
      page
    })

    if (data.length === 0) break

    for (const file of data) {
      // Skip deleted files — no video will exist
      if (file.status === 'removed') continue

      if (minimatch(file.filename, specPattern)) {
        files.push({ path: file.filename })
      }
    }

    if (data.length < perPage) break
    page++

    if (page > 30) {
      core.warning(
        'PR diff exceeds 3000 files, proceeding with what we have.'
      )
      break
    }
  }

  core.info(`Found ${files.length} changed spec file(s) matching "${specPattern}"`)
  return files
}
