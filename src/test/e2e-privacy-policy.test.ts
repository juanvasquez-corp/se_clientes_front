/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import playwrightConfig from '../../playwright.config'

const realLoginTestPath = resolve('tests/e2e/login-real.e2e.ts')
const sessionTestPath = resolve('tests/e2e/session.spec.ts')

describe('real login E2E privacy policy', () => {
  it('never retains Playwright output, screenshots, videos or traces', () => {
    expect(playwrightConfig.preserveOutput).toBe('never')
    expect(playwrightConfig.use?.screenshot).toBe('off')
    expect(playwrightConfig.use?.trace).toBe('off')
    expect(playwrightConfig.use?.video).toBe('off')
    expect(playwrightConfig.outputDir).toBeDefined()
    expect(isAbsolute(playwrightConfig.outputDir ?? '')).toBe(true)
    expect(playwrightConfig.outputDir).not.toContain(resolve('.'))
  })

  it('loads credentials only through local environment variable names', async () => {
    const source = await readFile(realLoginTestPath, 'utf8')

    expect(source).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu)
    expect(source).not.toMatch(/testInfo\.attach|attachment|screenshot\s*\(/u)
    expect(source).toContain("process.env[name]")
    expect(source).toContain('E2E_SUPERADMIN_EMAIL')
    expect(source).toContain('E2E_MASTER_EMAIL')
    expect(source).toContain('E2E_VISUALIZER_EMAIL')
  })

  it('keeps the session suite free of identifiers and retained diagnostics', async () => {
    const source = await readFile(sessionTestPath, 'utf8')

    expect(source).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu)
    expect(source).not.toMatch(/testInfo\.attach|attachment|screenshot\s*\(/u)
    expect(source).not.toMatch(/trace\s*:\s*['"]on['"]/u)
    expect(playwrightConfig.testMatch).toContain('**/session.spec.ts')
  })
})
