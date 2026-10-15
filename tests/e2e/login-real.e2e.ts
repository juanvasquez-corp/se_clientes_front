import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { resolveE2EOrigins } from '../../src/test/e2e-origins'
import { waitForE2EBackend } from '../../src/test/e2e-backend-readiness'

const realLoginEnabled = process.env.RUN_REAL_LOGIN_E2E === '1'
const { apiBaseUrl, frontendOrigin } = resolveE2EOrigins(process.env)
const loginUrl = `${frontendOrigin}/login`

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
      const logoutTrigger = page.getByRole('button', { name: 'Cerrar sesión' })
      if (await logoutTrigger.isVisible().catch(() => false)) {
        await logoutTrigger.click()
        const dialog = page.getByRole('dialog', { name: 'Cerrar sesión' })
        await dialog.getByRole('button', { name: 'Cerrar sesión' }).click()
      }
      await page
        .evaluate(() => {
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
  }) => {
    test.skip(!realLoginEnabled, 'Requiere RUN_REAL_LOGIN_E2E=1 y credenciales locales.')
    await waitForE2EBackend({ enabled: realLoginEnabled, apiBaseUrl })
    const failures: string[] = []
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !message.text().startsWith('Failed to load resource:')
      ) {
        failures.push(`console-error: ${message.text()}`)
      }
    })
    page.on('pageerror', () => {
      failures.push('page-error')
    })

    const configuredCredentials = credentials()
    expect(configuredCredentials).toHaveLength(3)

    for (const credential of configuredCredentials) {
      await context.clearCookies()
      await page.goto(loginUrl)
      await expectStorageEmpty(page)

      await page.getByRole('textbox', { name: /correo electrónico/i }).fill(
        credential.email,
      )
      await page.getByLabel(/^contraseña.*obligatorio/i).fill(credential.password)
      await page.getByRole('button', { name: 'Ingresar' }).click()

      await expect(page).toHaveURL(new RegExp(`${credential.destination}$`))
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
      const roleLabel = {
        superadmin: 'Superadministrador',
        master: 'Master',
        visualizer: 'Visualizador',
      }[credential.role]
      await expect(page.getByText(roleLabel, { exact: true }).first()).toBeVisible()
      await expectHttpOnlyRefresh(context, page)
      await expectStorageEmpty(page)
      expect(failures).toEqual([])

      await page.getByRole('button', { name: 'Cerrar sesión' }).click()
      const dialog = page.getByRole('dialog', { name: 'Cerrar sesión' })
      await dialog.getByRole('button', { name: 'Cerrar sesión' }).click()
      await expect(page).toHaveURL(/\/login$/u)
      expect(
        (await context.cookies()).some(
          ({ name }) => name === 'refresh_token',
        ),
      ).toBe(false)
      await expectStorageEmpty(page)
    }
  })
})
