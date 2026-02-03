import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Mock @actions/core
jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

describe('collectVideoFiles', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cypress-videos-'))
  })

  it('walks directory tree and collects .mp4 files', async () => {
    const { collectVideoFiles } = await import('../src/upload.js')

    // Create nested video structure
    fs.mkdirSync(path.join(tmpDir, 'auth'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'cart'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'auth', 'login.cy.ts.mp4'), 'fake')
    fs.writeFileSync(path.join(tmpDir, 'cart', 'checkout.cy.ts.mp4'), 'fake')

    const result = collectVideoFiles(tmpDir)

    expect(result.size).toBe(2)
    expect(result.has('auth/login.cy.ts')).toBe(true)
    expect(result.has('cart/checkout.cy.ts')).toBe(true)
  })

  it('returns empty map for nonexistent directory', async () => {
    const { collectVideoFiles } = await import('../src/upload.js')

    const result = collectVideoFiles('/nonexistent/path')
    expect(result.size).toBe(0)
  })

  it('ignores non-.mp4 files', async () => {
    const { collectVideoFiles } = await import('../src/upload.js')

    fs.writeFileSync(path.join(tmpDir, 'report.json'), 'fake')
    fs.writeFileSync(path.join(tmpDir, 'screenshot.png'), 'fake')
    fs.writeFileSync(path.join(tmpDir, 'test.cy.ts.mp4'), 'fake')

    const result = collectVideoFiles(tmpDir)
    expect(result.size).toBe(1)
    expect(result.has('test.cy.ts')).toBe(true)
  })
})

describe('specToRelativeName', () => {
  it('strips cypress/e2e/ prefix', async () => {
    const { specToRelativeName } = await import('../src/upload.js')
    expect(specToRelativeName('cypress/e2e/auth/login.cy.ts')).toBe(
      'auth/login.cy.ts'
    )
  })

  it('strips cypress/integration/ prefix', async () => {
    const { specToRelativeName } = await import('../src/upload.js')
    expect(specToRelativeName('cypress/integration/auth/login.cy.ts')).toBe(
      'auth/login.cy.ts'
    )
  })

  it('strips src/ prefix', async () => {
    const { specToRelativeName } = await import('../src/upload.js')
    expect(specToRelativeName('src/tests/login.cy.ts')).toBe(
      'tests/login.cy.ts'
    )
  })

  it('returns full path when no known root matches', async () => {
    const { specToRelativeName } = await import('../src/upload.js')
    expect(specToRelativeName('custom/dir/login.cy.ts')).toBe(
      'custom/dir/login.cy.ts'
    )
  })
})
