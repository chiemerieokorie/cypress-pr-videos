import { describe, it, expect } from '@jest/globals'
import { buildCommentBody, COMMENT_MARKER } from '../src/comment.js'

describe('buildCommentBody', () => {
  it('builds a markdown table with video links', () => {
    const results = [
      { spec: 'cypress/e2e/auth/login.cy.ts', url: 'https://example.com/video1' },
      { spec: 'cypress/e2e/cart/checkout.cy.ts', url: 'https://example.com/video2' }
    ]

    const body = buildCommentBody('### 🎬 Cypress Test Videos', results, 259200)

    expect(body).toContain(COMMENT_MARKER)
    expect(body).toContain('### 🎬 Cypress Test Videos')
    expect(body).toContain('`auth/login.cy.ts`')
    expect(body).toContain('`cart/checkout.cy.ts`')
    expect(body).toContain('[▶️ Watch](https://example.com/video1)')
    expect(body).toContain('Videos expire 72 hours after upload.')
  })
})
