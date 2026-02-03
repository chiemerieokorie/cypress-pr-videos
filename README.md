# Cypress PR Videos

A GitHub Action that uploads Cypress test videos for changed spec files to
Cloudflare R2 and posts a PR comment with signed playback URLs.

## How it works

1. Detects which spec files were changed in the PR diff
2. Matches those specs to video files in the Cypress videos directory
3. Uploads matching videos to Cloudflare R2
4. Posts (or updates) a single PR comment with signed, time-limited URLs

Only videos for specs touched in the PR are uploaded — not the entire test
suite.

## Prerequisites

Before using this action, ensure:

1. **Cypress video recording is enabled** in your `cypress.config.ts`:
   ```ts
   export default defineConfig({
     e2e: {
       video: true,
     },
   });
   ```

2. **Required permissions** are set on your job:
   ```yaml
   jobs:
     e2e:
       runs-on: ubuntu-latest
       permissions:
         contents: read
         pull-requests: write  # Required for posting PR comments
   ```

3. **R2 secrets** are configured in your repository (see [R2 bucket setup](#r2-bucket-setup))

## Usage

### Basic example

```yaml
- name: Cypress run
  uses: cypress-io/github-action@v6

- name: Post test videos
  if: always() && github.event_name == 'pull_request'
  uses: chiemerieokorie/cypress-pr-videos@v1
  with:
    r2-account-id: ${{ secrets.R2_ACCOUNT_ID }}
    r2-access-key-id: ${{ secrets.R2_ACCESS_KEY_ID }}
    r2-secret-access-key: ${{ secrets.R2_SECRET_ACCESS_KEY }}
    r2-bucket: ci-artifacts
```

### Monorepo example

For monorepos, adjust `video-dir` and `spec-pattern` to match your project structure:

```yaml
- name: Post PR test videos
  if: always() && github.event_name == 'pull_request'
  uses: chiemerieokorie/cypress-pr-videos@v1
  with:
    r2-account-id: ${{ secrets.R2_ACCOUNT_ID }}
    r2-access-key-id: ${{ secrets.R2_ACCESS_KEY_ID }}
    r2-secret-access-key: ${{ secrets.R2_SECRET_ACCESS_KEY }}
    r2-bucket: ${{ secrets.R2_BUCKET }}
    video-dir: apps/web/cypress/videos
    spec-pattern: 'apps/web/cypress/e2e/**/*.cy.{ts,js}'
```

## Inputs

| Input                    | Required | Default                               | Description                             |
| ------------------------ | -------- | ------------------------------------- | --------------------------------------- |
| `r2-account-id`          | yes      | —                                     | Cloudflare account ID                   |
| `r2-access-key-id`       | yes      | —                                     | R2 API token key ID                     |
| `r2-secret-access-key`   | yes      | —                                     | R2 API token secret                     |
| `r2-bucket`              | yes      | —                                     | R2 bucket name                          |
| `video-dir`              | no       | `cypress/videos`                      | Path to Cypress video output            |
| `spec-pattern`           | no       | `cypress/e2e/**/*.cy.{ts,js,tsx,jsx}` | Glob to identify spec files in the diff |
| `url-expiry-seconds`     | no       | `259200` (72h)                        | Signed URL lifetime                     |
| `github-token`           | no       | `${{ github.token }}`                 | Token for PR comment API                |
| `comment-header`         | no       | `### 🎬 Cypress Test Videos`          | Markdown header for the comment         |
| `max-concurrent-uploads` | no       | `5`                                   | Parallel upload limit                   |

## Outputs

| Output            | Description                         |
| ----------------- | ----------------------------------- |
| `video-urls`      | JSON array of `{spec, url}` objects |
| `videos-uploaded` | Count of videos uploaded            |

## R2 bucket setup

1. Create an R2 bucket (e.g. `ci-artifacts`) in Cloudflare
1. Create an API token scoped to Object Read & Write on that bucket
1. Set a lifecycle rule to delete objects older than 14 days
1. Store `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` as
   org-level GitHub secrets

Objects are stored at `cypress/{owner}/{repo}/pr-{number}/{spec}.mp4`. Re-runs
overwrite previous uploads for the same spec.

## Limitations

- Fork PRs are skipped (the default `GITHUB_TOKEN` is read-only)
- GitHub's CSP blocks inline `<video>` playback — links open in a new tab
- Signed URLs expire after the configured lifetime (default 72h)

## Troubleshooting

### "Resource not accessible by integration" error

The action can't post PR comments. Add the required permission to your job:

```yaml
permissions:
  pull-requests: write
```

### No videos are uploaded

1. **Check that video recording is enabled** in `cypress.config.ts`:
   ```ts
   video: true
   ```

2. **Verify the `video-dir` path** matches your project structure. For monorepos:
   ```yaml
   video-dir: apps/web/cypress/videos
   ```

3. **Check the `spec-pattern`** matches your spec file paths. For monorepos:
   ```yaml
   spec-pattern: 'apps/web/cypress/e2e/**/*.cy.{ts,js}'
   ```

## Development

```bash
npm install
npm test
npm run package   # bundles to dist/index.js
```

## License

MIT
