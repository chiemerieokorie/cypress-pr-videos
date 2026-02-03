import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock @actions/core
const mockGetInput = jest.fn<(name: string) => string>()
const mockSetOutput = jest.fn()
const mockSetFailed = jest.fn()
const mockInfo = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  info: mockInfo,
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

// Mock @actions/github
const mockContext = {
  repo: { owner: 'test-org', repo: 'test-repo' },
  payload: {
    pull_request: {
      number: 42,
      head: { repo: { fork: false } }
    }
  }
}
jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: jest.fn(),
  context: mockContext
}))

// Mock diff, upload, comment modules
const mockGetChangedSpecs = jest.fn()
const mockUploadVideos = jest.fn()
const mockPostOrUpdateComment = jest.fn()

jest.unstable_mockModule('../src/diff.js', () => ({
  getChangedSpecs: mockGetChangedSpecs
}))
jest.unstable_mockModule('../src/upload.js', () => ({
  uploadVideos: mockUploadVideos
}))
jest.unstable_mockModule('../src/comment.js', () => ({
  postOrUpdateComment: mockPostOrUpdateComment
}))

describe('run', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-token': 'fake-token',
        'spec-pattern': 'cypress/e2e/**/*.cy.ts',
        'video-dir': 'cypress/videos',
        'comment-header': '### Videos',
        'url-expiry-seconds': '259200',
        'max-concurrent-uploads': '5',
        'inline-videos': 'true',
        'r2-account-id': 'acc-id',
        'r2-access-key-id': 'key-id',
        'r2-secret-access-key': 'secret',
        'r2-bucket': 'bucket'
      }
      return inputs[name] ?? ''
    })
    // Reset payload to non-fork PR
    mockContext.payload = {
      pull_request: {
        number: 42,
        head: { repo: { fork: false } }
      }
    }
  })

  it('skips when not a pull_request event', async () => {
    const { run } = await import('../src/main.js')
    mockContext.payload = {} as typeof mockContext.payload

    await run()

    expect(mockInfo).toHaveBeenCalledWith('Not a pull_request event. Skipping.')
    expect(mockGetChangedSpecs).not.toHaveBeenCalled()
  })

  it('skips fork PRs', async () => {
    const { run } = await import('../src/main.js')
    mockContext.payload = {
      pull_request: {
        number: 42,
        head: { repo: { fork: true } }
      }
    }

    await run()

    expect(mockInfo).toHaveBeenCalledWith('Skipping: fork PRs not supported.')
    expect(mockGetChangedSpecs).not.toHaveBeenCalled()
  })

  it('skips when no spec files changed', async () => {
    const { run } = await import('../src/main.js')
    mockGetChangedSpecs.mockResolvedValueOnce([])

    await run()

    expect(mockSetOutput).toHaveBeenCalledWith('video-urls', '[]')
    expect(mockSetOutput).toHaveBeenCalledWith('videos-uploaded', '0')
    expect(mockUploadVideos).not.toHaveBeenCalled()
  })

  it('skips when no videos found on disk', async () => {
    const { run } = await import('../src/main.js')
    mockGetChangedSpecs.mockResolvedValueOnce([
      { path: 'cypress/e2e/test.cy.ts' }
    ])
    mockUploadVideos.mockResolvedValueOnce([])

    await run()

    expect(mockSetOutput).toHaveBeenCalledWith('video-urls', '[]')
    expect(mockSetOutput).toHaveBeenCalledWith('videos-uploaded', '0')
    expect(mockPostOrUpdateComment).not.toHaveBeenCalled()
  })

  it('uploads videos and posts comment on success', async () => {
    const { run } = await import('../src/main.js')
    mockGetChangedSpecs.mockResolvedValueOnce([
      { path: 'cypress/e2e/auth/login.cy.ts' }
    ])
    const results = [
      {
        spec: 'cypress/e2e/auth/login.cy.ts',
        url: 'https://example.com/video'
      }
    ]
    mockUploadVideos.mockResolvedValueOnce(results)
    mockPostOrUpdateComment.mockResolvedValueOnce(undefined)

    await run()

    expect(mockPostOrUpdateComment).toHaveBeenCalledWith(
      'fake-token',
      results,
      '### Videos',
      259200,
      true
    )
    expect(mockSetOutput).toHaveBeenCalledWith(
      'video-urls',
      JSON.stringify(results)
    )
    expect(mockSetOutput).toHaveBeenCalledWith('videos-uploaded', '1')
  })

  it('calls setFailed on unexpected error', async () => {
    const { run } = await import('../src/main.js')
    mockGetChangedSpecs.mockRejectedValueOnce(new Error('API failure'))

    await run()

    expect(mockSetFailed).toHaveBeenCalledWith('API failure')
  })

  it('handles non-Error throws', async () => {
    const { run } = await import('../src/main.js')
    mockGetChangedSpecs.mockRejectedValueOnce('string error')

    await run()

    expect(mockSetFailed).toHaveBeenCalledWith('string error')
  })
})
