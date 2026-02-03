import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock @actions/core
jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

// Mock @actions/github
const mockListFiles = jest.fn()
jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: () => ({
    rest: {
      pulls: {
        listFiles: mockListFiles
      }
    }
  }),
  context: {
    repo: { owner: 'test-org', repo: 'test-repo' },
    payload: { pull_request: { number: 42 } }
  }
}))

describe('getChangedSpecs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns spec files matching the pattern', async () => {
    const { getChangedSpecs } = await import('../src/diff.js')

    mockListFiles.mockResolvedValueOnce({
      data: [
        { filename: 'cypress/e2e/auth/login.cy.ts', status: 'modified' },
        { filename: 'cypress/e2e/cart/checkout.cy.ts', status: 'added' },
        { filename: 'src/utils/helper.ts', status: 'modified' },
        { filename: 'README.md', status: 'modified' }
      ]
    })

    const result = await getChangedSpecs(
      'fake-token',
      'cypress/e2e/**/*.cy.{ts,js,tsx,jsx}'
    )

    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('cypress/e2e/auth/login.cy.ts')
    expect(result[1].path).toBe('cypress/e2e/cart/checkout.cy.ts')
  })

  it('excludes deleted files', async () => {
    const { getChangedSpecs } = await import('../src/diff.js')

    mockListFiles.mockResolvedValueOnce({
      data: [
        { filename: 'cypress/e2e/auth/login.cy.ts', status: 'removed' },
        { filename: 'cypress/e2e/cart/checkout.cy.ts', status: 'modified' }
      ]
    })

    const result = await getChangedSpecs(
      'fake-token',
      'cypress/e2e/**/*.cy.{ts,js,tsx,jsx}'
    )

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('cypress/e2e/cart/checkout.cy.ts')
  })

  it('returns empty array when no specs match', async () => {
    const { getChangedSpecs } = await import('../src/diff.js')

    mockListFiles.mockResolvedValueOnce({
      data: [{ filename: 'src/utils/helper.ts', status: 'modified' }]
    })

    const result = await getChangedSpecs(
      'fake-token',
      'cypress/e2e/**/*.cy.{ts,js,tsx,jsx}'
    )

    expect(result).toHaveLength(0)
  })
})
