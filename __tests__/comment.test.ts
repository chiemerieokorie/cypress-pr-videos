import { jest, describe, it, expect } from '@jest/globals'

// Mock @actions/core (needed by upload.ts which is imported by comment.ts)
jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

describe('buildCommentBody', () => {
  it('builds inline video display by default', async () => {
    const { buildCommentBody, COMMENT_MARKER } =
      await import('../src/comment.js')

    const results = [
      {
        spec: 'cypress/e2e/auth/login.cy.ts',
        url: 'https://example.com/video1'
      },
      {
        spec: 'cypress/e2e/cart/checkout.cy.ts',
        url: 'https://example.com/video2'
      }
    ]

    const body = buildCommentBody('### 🎬 Cypress Test Videos', results, 259200)

    expect(body).toContain(COMMENT_MARKER)
    expect(body).toContain('### 🎬 Cypress Test Videos')
    expect(body).toContain('<details open>')
    expect(body).toContain('<strong>auth/login.cy.ts</strong>')
    expect(body).toContain('<strong>cart/checkout.cy.ts</strong>')
    expect(body).toContain('https://example.com/video1')
    expect(body).toContain('https://example.com/video2')
    expect(body).toContain('Videos expire 72 hours after upload.')
  })

  it('builds a markdown table with video links when inline is false', async () => {
    const { buildCommentBody, COMMENT_MARKER } =
      await import('../src/comment.js')

    const results = [
      {
        spec: 'cypress/e2e/auth/login.cy.ts',
        url: 'https://example.com/video1'
      },
      {
        spec: 'cypress/e2e/cart/checkout.cy.ts',
        url: 'https://example.com/video2'
      }
    ]

    const body = buildCommentBody(
      '### 🎬 Cypress Test Videos',
      results,
      259200,
      false
    )

    expect(body).toContain(COMMENT_MARKER)
    expect(body).toContain('### 🎬 Cypress Test Videos')
    expect(body).toContain('`auth/login.cy.ts`')
    expect(body).toContain('`cart/checkout.cy.ts`')
    expect(body).toContain('[▶️ Watch](https://example.com/video1)')
    expect(body).toContain('Videos expire 72 hours after upload.')
  })

  it('handles specs with non-standard roots', async () => {
    const { buildCommentBody } = await import('../src/comment.js')

    const results = [
      { spec: 'tests/e2e/login.cy.ts', url: 'https://example.com/v' }
    ]

    const body = buildCommentBody('### Videos', results, 3600)

    expect(body).toContain('<strong>e2e/login.cy.ts</strong>')
    expect(body).toContain('Videos expire 1 hours after upload.')
  })
})
