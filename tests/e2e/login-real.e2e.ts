import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { resolveE2EOrigins } from '../../src/test/e2e-origins'

declare global {
  interface Window {
    __loginFixtureCleanup?: () => Promise<void>
    __loginFixtureState?: () => {
      hasAccessToken: boolean
      hasCsrfToken: boolean
      role: string | undefined
      status: string
    }
  }
}

const realLoginEnabled = process.env.RUN_REAL_LOGIN_E2E === '1'
const { apiBaseUrl, frontendOrigin } = resolveE2EOrigins(process.env)
const fixtureUrl = `${frontendOrigin}/tests/fixtures/login-page.html?real=1`

interface RoleCredential {
  destination: '/profile' | '/users'
  email: string
  password: string
  role: 'master' | 'superadmin' | 'visualizer'
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`Falta la variable local requerida: ${name}.`)
  }
  return value
}

function credentials(): RoleCredential[] {
  return [
    {
      role: 'superadmin',
      destination: '/users',
      email: requiredEnvironment('E2E_SUPERADMIN_EMAIL'),
      password: requiredEnvironment('E2E_SUPERADMIN_PASSWORD'),
    },
    {
      role: 'master',
      destination: '/profile',
      email: requiredEnvironment('E2E_MASTER_EMAIL'),
      password: requiredEnvironment('E2E_MASTER_PASSWORD'),
    },
    {
      role: 'visualizer',
      destination: '/profile',
      email: requiredEnvironment('E2E_VISUALIZER_EMAIL'),
      password: requiredEnvironment('E2E_VISUALIZER_PASSWORD'),
    },
  ]
}

async function expectBackendAvailable(request: APIRequestContext) {
  const response = await request.get(new URL('/openapi.json', apiBaseUrl).toString())
  expect(response.ok()).toBe(true)
}

async function expectStorageEmpty(page: Page) {
  const storage = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }))
  expect(storage).toEqual({ local: 0, session: 0 })
}

async function expectHttpOnlyRefresh(context: BrowserContext, page: Page) {
  const cookies = await context.cookies()
  const refreshCookies = cookies.filter(({ name }) => name === 'refresh_token')
  expect(refreshCookies).toHaveLength(1)
  expect(refreshCookies[0]?.httpOnly).toBe(true)
  expect(await page.evaluate(() => document.cookie.includes('refresh_token'))).toBe(false)
}

test.describe('real backend login', () => {
  test.afterEach(async ({ context, page }) => {
    if (!page.isClosed()) {
      await page
        .evaluate(async () => {
          if (window.__loginFixtureState?.().status === 'authenticated') {
            await window.__loginFixtureCleanup?.()
          }
          for (const input of document.querySelectorAll('input')) input.value = ''
          localStorage.clear()
          sessionStorage.clear()
        })
        .catch(() => undefined)
    }
    await context.clearCookies()
  })

  test('each configured role authenticates and reaches its normative destination', async ({
    context,
    page,
    request,
  }) => {
    test.skip(!realLoginEnabled, 'Requiere RUN_REAL_LOGIN_E2E=1 y credenciales locales.')
    const failures: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push('console-error')
    })
    page.on('pageerror', () => {
      failures.push('page-error')
    })

    await expectBackendAvailable(request)
    const configuredCredentials = credentials()
    expect(configuredCredentials).toHaveLength(3)

    for (const credential of configuredCredentials) {
      await context.clearCookies()
      await page.goto(fixtureUrl)
      await expectStorageEmpty(page)

      await page.getByRole('textbox', { name: /correo electrónico/i }).fill(
        credential.email,
      )
      await page.getByLabel(/^contraseña.*obligatorio/i).fill(credential.password)
      await page.getByRole('button', { name: 'Ingresar' }).click()

      await expect(page).toHaveURL(new RegExp(`${credential.destination}$`))
      const session = await page.evaluate(() => window.__loginFixtureState?.())
      expect(session).toEqual({
        hasAccessToken: true,
        hasCsrfToken: true,
        role: credential.role,
        status: 'authenticated',
      })
      await expectHttpOnlyRefresh(context, page)
      await expectStorageEmpty(page)
      expect(failures).toEqual([])

      await page.evaluate(async () => window.__loginFixtureCleanup?.())
      expect(await page.evaluate(() => window.__loginFixtureState?.().status)).toBe(
        'dead',
      )
      expect(
        (await context.cookies()).some(
          ({ name }) => name === 'refresh_token',
        ),
      ).toBe(false)
      await expectStorageEmpty(page)
    }
  })
})
