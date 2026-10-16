/// <reference types="node" />

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import type axe from 'axe-core'
import type * as Playwright from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import playwrightConfig from '../../playwright.config'
import E2ESafeReporter from './e2e-safe-reporter'
// Prepara la compilación de dependencias fuera del caso; no conserva una instancia para los spies.
// Cada escenario vuelve a importar el helper después de resetModules, sin red en preparación.
import './e2e-backend-readiness'

// Las suites importadas comparten esta declaración con bootstrap.e2e.ts en Playwright.
declare global {
  interface Window { axe: typeof axe }
}

const registeredTests = vi.hoisted(() => new Map<string, (fixtures: object) => Promise<void>>())
vi.mock('@playwright/test', async (importOriginal) => {
  const original = await importOriginal<typeof Playwright>()
  const register = (title: string, callback: (fixtures: object) => Promise<void>) => {
    registeredTests.set(title, callback)
  }
  return {
    ...original,
    test: Object.assign(register, {
      describe: (_title: string, callback: () => void) => { callback() },
      beforeEach: () => undefined,
      afterEach: () => undefined,
      skip: (skip: boolean) => { if (skip) throw new Error('SYNTHETIC_SKIP') },
    }),
  }
})

beforeEach(() => {
  // Cada caso reevalúa los flags de las suites; vi.mock conserva su factory de registro.
  vi.resetModules()
  registeredTests.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
  registeredTests.clear()
})

const realLoginTestPath = resolve('tests/e2e/login-real.e2e.ts')
const sessionTestPath = resolve('tests/e2e/session.spec.ts')
const playwrightConfigPath = resolve('playwright.config.ts')

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

  it('uses only the safe reporter, without printing raw failure diagnostics', () => {
    expect(playwrightConfig.reporter).toEqual([['./src/test/e2e-safe-reporter.ts']])
  })

  it('reports statuses and only allowlisted readiness diagnostics without changing the outcome', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const reporter = new E2ESafeReporter()
    reporter.onTestEnd({ location: { file: 'login-real.e2e.ts', line: 100, column: 1 } }, {
      status: 'failed',
      errors: [
        { message: 'Error: E2E_BACKEND_NOT_READY: transport (10000 ms).' },
        { message: 'PRIVATE_MARKER', stack: 'PRIVATE_MARKER' },
        { message: 'Error: E2E_BACKEND_NOT_READY: transport (10000 ms). PRIVATE_MARKER' },
      ],
    })
    reporter.onError()
    reporter.onEnd({ status: 'failed' })
    expect(output.mock.calls).toEqual([
      ['E2E login-real.e2e.ts:100: failed'],
      ['E2E_BACKEND_NOT_READY: transport (10000 ms).'],
      ['E2E runner: failed (diagnóstico privado omitido).'],
      ['E2E result: failed; {"passed":0,"failed":1,"timedOut":0,"skipped":0,"interrupted":0}'],
    ])
    expect(reporter.printsToStdio()).toBe(true)
  })

  it('loads credentials only through local environment variable names', async () => {
    const source = await readFile(realLoginTestPath, 'utf8')
    const configSource = await readFile(playwrightConfigPath, 'utf8')

    expect(source).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu)
    expect(source).not.toMatch(/testInfo\.attach|attachment|screenshot\s*\(/u)
    expect(source).toContain("process.env[name]")
    expect(source).toContain('E2E_SUPERADMIN_EMAIL')
    expect(source).toContain('E2E_MASTER_EMAIL')
    expect(source).toContain('E2E_VISUALIZER_EMAIL')
    expect(configSource).toContain('loadEnvFile()')
    const webServer = playwrightConfig.webServer
    if (webServer === undefined || Array.isArray(webServer)) {
      throw new Error('La configuración E2E requiere un único servidor web.')
    }
    expect(Object.keys(webServer.env ?? {})).toEqual(['VITE_API_BASE_URL'])
    expect(JSON.stringify(webServer.env)).not.toMatch(/E2E_.*(?:EMAIL|PASSWORD)/u)
  })

  it('keeps the session suite free of identifiers and retained diagnostics', async () => {
    const source = await readFile(sessionTestPath, 'utf8')

    expect(source).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu)
    expect(source).not.toMatch(/testInfo\.attach|attachment|screenshot\s*\(/u)
    expect(source).not.toMatch(/trace\s*:\s*['"]on['"]/u)
    expect(playwrightConfig.testMatch).toContain('**/session.spec.ts')
  })

  it('runs preflight after opt-in but before credentials and browser access in all five suites', async () => {
    vi.stubEnv('RUN_REAL_LOGIN_E2E', '1')
    vi.stubEnv('RUN_REAL_PROFILE_E2E', '1')
    vi.stubEnv('RUN_REAL_USERS_E2E', '1')
    for (const role of ['SUPERADMIN', 'MASTER', 'VISUALIZER']) {
      vi.stubEnv(`E2E_${role}_EMAIL`, '')
      vi.stubEnv(`E2E_${role}_PASSWORD`, '')
    }
    const freshReadiness = await import('./e2e-backend-readiness')
    const preflight = vi.spyOn(freshReadiness, 'waitForE2EBackend')
      .mockRejectedValue(new Error('SAFE_PREFLIGHT_FAILURE'))
    await import('../../tests/e2e/login-real.e2e')
    await import('../../tests/e2e/session.spec')
    await import('../../tests/e2e/profile.e2e')
    await import('../../tests/e2e/users-directory.e2e')
    await import('../../tests/e2e/user-detail.e2e')
    const realTests = [...registeredTests].filter(([title]) =>
      title.startsWith('real backend') || title.startsWith('each configured role'),
    )
    expect(realTests).toHaveLength(5)
    const browser = new Proxy({}, { get() { throw new Error('BROWSER_BEFORE_PREFLIGHT') } })
    for (const [, run] of realTests) {
      await expect(run({ context: browser, page: browser, request: browser }))
        .rejects.toThrow('SAFE_PREFLIGHT_FAILURE')
    }
    expect(preflight).toHaveBeenCalledTimes(5)
    for (const [options] of preflight.mock.calls) expect(options.enabled).toBe(true)
  })

  it('skips every real suite before preflight or browser access when all flags are explicitly off', async () => {
    vi.stubEnv('RUN_REAL_LOGIN_E2E', '0')
    vi.stubEnv('RUN_REAL_PROFILE_E2E', '0')
    vi.stubEnv('RUN_REAL_USERS_E2E', '0')
    const freshReadiness = await import('./e2e-backend-readiness')
    const preflight = vi.spyOn(freshReadiness, 'waitForE2EBackend')
    await import('../../tests/e2e/login-real.e2e')
    await import('../../tests/e2e/session.spec')
    await import('../../tests/e2e/profile.e2e')
    await import('../../tests/e2e/users-directory.e2e')
    await import('../../tests/e2e/user-detail.e2e')
    const realTests = [...registeredTests].filter(([title]) =>
      title.startsWith('real backend') || title.startsWith('each configured role'),
    )
    expect(realTests).toHaveLength(5)
    const browser = new Proxy({}, { get() { throw new Error('BROWSER_WHILE_DISABLED') } })
    for (const [, run] of realTests) {
      await expect(run({ context: browser, page: browser })).rejects.toThrow('SYNTHETIC_SKIP')
    }
    expect(preflight).not.toHaveBeenCalled()
  })

  it('a controlled browser failure retains no synthetic secrets and still exits unsuccessfully', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'frontend-project-e2e-privacy-'))
    const email = 'privacy-marker@example.invalid'
    const password = 'privacy-password-marker'
    const outputDir = resolve(root, 'output')
    try {
      await writeFile(resolve(root, 'failure.e2e.ts'), `
        import { test, expect } from ${JSON.stringify(resolve('node_modules/@playwright/test/index.mjs'))}
        import { writeFile } from 'node:fs/promises'
        test('synthetic privacy failure', async ({ page }) => {
          await page.setContent('<label>Email<input id="email"></label><label>Password<input id="password"></label>')
          await page.locator('#email').fill(process.env.E2E_PRIVACY_EMAIL)
          await page.locator('#password').fill(process.env.E2E_PRIVACY_PASSWORD)
          await writeFile(${JSON.stringify(resolve(root, 'browser-reached.txt'))}, 'browser-filled')
          console.log(process.env.E2E_PRIVACY_EMAIL)
          console.error(process.env.E2E_PRIVACY_PASSWORD)
          expect(await page.locator('#password').inputValue()).toBe('deliberately different')
        })
      `)
      const reporter = playwrightConfig.reporter
      const childReporter = Array.isArray(reporter)
        ? reporter.map(([name]) => [name.startsWith('.') ? resolve(name) : name])
        : reporter
      await writeFile(resolve(root, 'playwright.config.ts'), `
        import config from ${JSON.stringify(resolve('playwright.config.ts'))}
        export default {
          ...config, testDir: ${JSON.stringify(root)}, webServer: undefined,
          outputDir: ${JSON.stringify(outputDir)}, reporter: ${JSON.stringify(childReporter)},
        }
      `)
      const result = await new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
        const child = spawn(process.execPath, [
          resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', resolve(root, 'playwright.config.ts'),
        ], {
          cwd: root,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            RUN_REAL_LOGIN_E2E: '0', RUN_REAL_PROFILE_E2E: '0', RUN_REAL_USERS_E2E: '0',
            E2E_PRIVACY_EMAIL: email, E2E_PRIVACY_PASSWORD: password,
          },
          timeout: 60_000,
        })
        let output = ''
        child.stdout.on('data', (data: Buffer) => { output += data.toString() })
        child.stderr.on('data', (data: Buffer) => { output += data.toString() })
        child.on('error', reject)
        child.on('close', (code) => { resolveResult({ code, output }) })
      })
      expect(result.code).toBe(1)
      expect(await readFile(resolve(root, 'browser-reached.txt'), 'utf8')).toBe('browser-filled')
      // Comprobaciones booleanas: incluso una regresión nunca imprime el marcador completo.
      expect(result.output.includes(email)).toBe(false)
      expect(result.output.includes(password)).toBe(false)
      expect(result.output).toContain('failed')
      const entries = await readdir(root, { recursive: true, withFileTypes: true })
      expect(entries.some((entry) => /error-context|\.zip$|\.webm$|\.png$|report/u.test(entry.name))).toBe(false)
      for (const entry of entries.filter((entry) => entry.isFile())) {
        const content = await readFile(resolve(entry.parentPath, entry.name), 'utf8')
        expect(content.includes(email)).toBe(false)
        expect(content.includes(password)).toBe(false)
      }
    } finally {
      // Solo el directorio exclusivo de esta prueba; nunca outputs de otra ejecución.
      await rm(root, { recursive: true, force: true })
    }
  }, 90_000)
})
