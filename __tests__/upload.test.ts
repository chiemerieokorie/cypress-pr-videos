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

describe('findMatchingVideo', () => {
  it('matches video by suffix for standard cypress layout', async () => {
    const { findMatchingVideo } = await import('../src/upload.js')
    const videoMap = new Map([
      ['auth/login.cy.ts', '/videos/auth/login.cy.ts.mp4']
    ])

    const result = findMatchingVideo('cypress/e2e/auth/login.cy.ts', videoMap)
    expect(result).toEqual({
      videoKey: 'auth/login.cy.ts',
      videoPath: '/videos/auth/login.cy.ts.mp4'
    })
  })

  it('matches video by suffix for monorepo layout', async () => {
    const { findMatchingVideo } = await import('../src/upload.js')
    const videoMap = new Map([
      ['navigation.cy.ts', '/videos/navigation.cy.ts.mp4']
    ])

    const result = findMatchingVideo(
      'apps/web/cypress/e2e/navigation.cy.ts',
      videoMap
    )
    expect(result).toEqual({
      videoKey: 'navigation.cy.ts',
      videoPath: '/videos/navigation.cy.ts.mp4'
    })
  })

  it('prefers longest (most specific) match', async () => {
    const { findMatchingVideo } = await import('../src/upload.js')
    const videoMap = new Map([
      ['login.cy.ts', '/videos/login.cy.ts.mp4'],
      ['auth/login.cy.ts', '/videos/auth/login.cy.ts.mp4']
    ])

    const result = findMatchingVideo('cypress/e2e/auth/login.cy.ts', videoMap)
    expect(result).toEqual({
      videoKey: 'auth/login.cy.ts',
      videoPath: '/videos/auth/login.cy.ts.mp4'
    })
  })

  it('returns null when no match found', async () => {
    const { findMatchingVideo } = await import('../src/upload.js')
    const videoMap = new Map([['other.cy.ts', '/videos/other.cy.ts.mp4']])

    const result = findMatchingVideo('cypress/e2e/auth/login.cy.ts', videoMap)
    expect(result).toBeNull()
  })

  it('matches exact path', async () => {
    const { findMatchingVideo } = await import('../src/upload.js')
    const videoMap = new Map([
      ['auth/login.cy.ts', '/videos/auth/login.cy.ts.mp4']
    ])

    const result = findMatchingVideo('auth/login.cy.ts', videoMap)
    expect(result).toEqual({
      videoKey: 'auth/login.cy.ts',
      videoPath: '/videos/auth/login.cy.ts.mp4'
    })
  })
})
