import { expect, test, type Page, type Route } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

import { resolveE2EOrigins } from '../../src/test/e2e-origins'
import { waitForE2EBackend } from '../../src/test/e2e-backend-readiness'
import type { UserResponse } from '../../src/contracts/schemas/user'

const { apiBaseUrl, frontendOrigin } = resolveE2EOrigins(process.env)
const usersUrl = `${frontendOrigin}/users`
const realUsersEnabled = process.env.RUN_REAL_USERS_E2E === '1'
const ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
type Role = 'superadmin' | 'master' | 'visualizer'

const tokens = {
  access_token: 'users-directory-access',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'users-directory-csrf',
} as const

const account = {
  uuid: ACCOUNT_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  rol: 'superadmin',
  is_active: true,
} as const

const other = {
  uuid: OTHER_UUID,
  name: 'Bea',
  last_name: 'Torres',
  email: 'bea@example.com',
  phone_number: null,
  rol: 'master',
  is_active: true,
} as const

function endpoint(path: string): string {
  return `${apiBaseUrl.replace(/\/$/u, '')}${path}`
}

async function preflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') return false
  await route.fulfill({
    status: 204,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, X-CSRF-Token, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': frontendOrigin,
    },
  })
  return true
}

function profile(role: Role) {
  return { ...account, rol: role }
}

async function mockSession(page: Page, role: Role = 'superadmin') {
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: { csrf_token: 'users-directory-csrf' } })
  })
  await page.route(endpoint('/auth/refresh'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: tokens })
  })
  await page.route(endpoint('/users/me'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: profile(role) })
  })
}

function pagePayload(
  page: number,
  data: readonly UserResponse[] = [account, other],
  total = 21,
) {
  return {
    total_records: total,
    current_page: page,
    total_pages: Math.max(1, Math.ceil(total / 10)),
    page_size: 10,
    data,
  }
}

async function expectAxe(page: Page) {
  await page.addScriptTag({ content: axe.source })
  const results = await page.evaluate<AxeResults>(async () => window.axe.run(document))
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)
}

test.beforeEach(({ page }) => {
  const failures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      failures.push(message.text())
    }
  })
  page.on('pageerror', (error) => failures.push(error.message))
  Reflect.set(page, '__usersDirectoryFailures', failures)
})

test.afterEach(({ page }) => {
  const failures = Reflect.get(page, '__usersDirectoryFailures') as unknown
  expect(Array.isArray(failures) ? failures : []).toEqual([])
})

test('lists, paginates, searches exact email, clears and exposes no deferred controls', async ({
  page,
}) => {
  await mockSession(page)
  const listUrls: URL[] = []
  const searchBodies: unknown[] = []
  await page.route(`${endpoint('/users')}?*`, async (route) => {
    if (await preflight(route)) return
    const url = new URL(route.request().url())
    listUrls.push(url)
    const requestedPage = Number(url.searchParams.get('page'))
    await route.fulfill({
      json: requestedPage === 2
        ? pagePayload(2, [{ ...other, name: 'Segunda página' }])
        : pagePayload(1),
    })
  })
  await page.route(endpoint('/users/search'), async (route) => {
    if (await preflight(route)) return
    const body = route.request().postDataJSON() as { email?: unknown }
    searchBodies.push(body)
    if (body.email === 'missing@example.com') {
      await route.fulfill({ status: 404, json: { detail: 'backend-private-message' } })
      return
    }
    await route.fulfill({ json: { ...other, email: String(body.email) } })
  })

  await page.goto(usersUrl)
  await expect(page.getByRole('heading', { level: 1, name: 'Gestión de usuarios' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Directorio de usuarios' })).toBeVisible()
  await expect(page.locator('[data-user-card-list]')).toBeHidden()
  await expect(page.getByText('21 registros')).toBeVisible()
  expect(listUrls).toHaveLength(1)
  const firstListUrl = listUrls[0]
  if (firstListUrl === undefined) throw new Error('No se registró la solicitud de listado.')
  expect([...firstListUrl.searchParams.keys()]).toEqual(['page', 'size'])
  expect(firstListUrl.searchParams.get('size')).toBe('10')
  await expect(page.getByRole('link', { name: 'Crear usuario' })).toHaveAttribute(
    'href',
    '/users/new',
  )
  await expect(page.getByRole('link', { name: /ver detalle de bea torres/iu })).toHaveAttribute(
    'href',
    `/users/${OTHER_UUID}`,
  )
  await expect(page.getByRole('button', { name: /activar|desactivar|eliminar/iu })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/cédula|contraseña|password|hash|fecha/iu)

  await page.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(
    page.getByRole('table').getByText('Segunda página', { exact: true }),
  ).toBeVisible()
  expect(listUrls).toHaveLength(2)

  const email = page.getByRole('textbox', { name: /correo electrónico/iu })
  await email.fill('correo-parcial')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('Ingresa un correo electrónico válido.')).toBeVisible()
  expect(searchBodies).toHaveLength(0)

  await email.fill('  BEA@EXAMPLE.COM  ')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByRole('table').getByText('bea@example.com')).toBeVisible()
  expect(searchBodies).toEqual([{ email: 'bea@example.com' }])
  await expect(page.getByRole('navigation', { name: 'Paginación de usuarios' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Limpiar' }).click()
  await expect(
    page.getByRole('table').getByText('Segunda página', { exact: true }),
  ).toBeVisible()
  await expect(email).toBeFocused()

  await email.fill('missing@example.com')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('No existe una cuenta para ese correo.')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('backend-private-message')
  await expect(page.getByRole('link', { name: 'Crear usuario' })).toHaveCount(1)
  await expect(page.locator('input[name="rol"], input[name="status"], input[name="name"]')).toHaveCount(0)
})

test('keeps localized loading during page replacement and renders valid empty state', async ({
  page,
}) => {
  await mockSession(page)
  let releasePage: (() => void) | undefined
  let empty = false
  await page.route(`${endpoint('/users')}?*`, async (route) => {
    if (await preflight(route)) return
    if (empty) {
      await route.fulfill({ json: pagePayload(1, [], 0) })
      return
    }
    const requestedPage = Number(new URL(route.request().url()).searchParams.get('page'))
    if (requestedPage === 2) {
      await new Promise<void>((resolve) => {
        releasePage = resolve
      })
    }
    await route.fulfill({ json: pagePayload(requestedPage) })
  })
  await page.goto(usersUrl)
  await expect(page.getByRole('table')).toBeVisible()

  await page.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(page.getByRole('status')).toContainText('Cargando directorio de usuarios')
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Buscar usuario por correo' })).toBeVisible()
  releasePage?.()
  await expect(page.getByRole('table')).toBeVisible()

  empty = true
  await page.reload()
  await expect(page.getByRole('heading', { name: 'No hay usuarios registrados' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Crear usuario' })).toHaveCount(2)
})

test('keeps network, 503 and 403 contextual while 401 ends the session', async ({ page }) => {
  await mockSession(page)
  let mode: 'network' | '503' | '403' | '401' | 'success' = 'network'
  let requests = 0
  await page.route(`${endpoint('/users')}?*`, async (route) => {
    requests += 1
    if (mode === 'network') return route.abort('failed')
    if (mode === '503') return route.fulfill({ status: 503, json: { detail: 'private' } })
    if (mode === '403') return route.fulfill({ status: 403, json: { detail: 'private' } })
    if (mode === '401') return route.fulfill({ status: 401, json: { detail: 'private' } })
    return route.fulfill({ json: pagePayload(1) })
  })
  await page.goto(usersUrl)
  await expect(page.getByText('Directorio no disponible')).toBeVisible()
  await expect(page).toHaveURL(/\/users$/u)

  mode = '503'
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('Directorio no disponible')).toBeVisible()
  expect(requests).toBe(2)
  await expect(page).toHaveURL(/\/users$/u)

  mode = '403'
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('Acceso denegado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expect(page).toHaveURL(/\/users$/u)

  mode = '401'
  await page.reload()
  await expect(page).toHaveURL(/\/login$/u)
})

test('renders only mobile cards at 390px with no overflow and no serious axe findings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSession(page)
  await page.route(`${endpoint('/users')}?*`, async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: pagePayload(1) })
  })
  await page.goto(usersUrl)

  await expect(page.getByRole('table')).toBeHidden()
  await expect(page.getByRole('list', { name: 'Usuarios' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Ana' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Bea Torres' })).toBeVisible()
  await expect(page.getByRole('link', { name: /ver detalle de bea torres/iu })).toBeVisible()
  await expectNoOverflow(page)
  await expectAxe(page)
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 })
})

for (const role of ['master', 'visualizer'] as const) {
  test(`${role} direct directory access is forbidden without a users request`, async ({ page }) => {
    await mockSession(page, role)
    let usersRequests = 0
    await page.route(`${endpoint('/users')}?*`, async (route) => {
      usersRequests += 1
      await route.fulfill({ json: pagePayload(1) })
    })
    await page.goto(usersUrl)
    await expect(page).toHaveURL(/\/forbidden$/u)
    expect(usersRequests).toBe(0)
  })
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`Falta ${name}.`)
  return value
}

test('real backend reads the directory/search for superadmin and forbids other roles', async ({
  context,
  page,
}) => {
  test.skip(!realUsersEnabled, 'Requiere RUN_REAL_USERS_E2E=1 y credenciales locales.')
  await waitForE2EBackend({ enabled: realUsersEnabled, apiBaseUrl })
  const credentials = [
    ['superadmin', requiredEnvironment('E2E_SUPERADMIN_EMAIL'), requiredEnvironment('E2E_SUPERADMIN_PASSWORD')],
    ['master', requiredEnvironment('E2E_MASTER_EMAIL'), requiredEnvironment('E2E_MASTER_PASSWORD')],
    ['visualizer', requiredEnvironment('E2E_VISUALIZER_EMAIL'), requiredEnvironment('E2E_VISUALIZER_PASSWORD')],
  ] as const

  for (const [role, email, password] of credentials) {
    await context.clearCookies()
    await page.goto(`${frontendOrigin}/login`)
    await page.getByRole('textbox', { name: /correo electrónico/iu }).fill(email)
    await page.getByLabel(/^contraseña.*obligatorio/iu).fill(password)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    if (role === 'superadmin') {
      await expect(page).toHaveURL(/\/users$/u)
      await expect(page.getByText(/registros$/u)).toBeVisible()
      const search = page.getByRole('textbox', { name: /correo electrónico/iu })
      await search.fill(email)
      await page.getByRole('button', { name: 'Buscar' }).click()
      await expect(page.getByText(email.toLowerCase(), { exact: true }).first()).toBeVisible()
      await page.getByRole('button', { name: 'Limpiar' }).click()
      await search.fill(`missing-${crypto.randomUUID()}@example.com`)
      await page.getByRole('button', { name: 'Buscar' }).click()
      await expect(page.getByText('No existe una cuenta para ese correo.')).toBeVisible()
    } else {
      await expect(page).toHaveURL(/\/profile$/u)
      await page.goto(usersUrl)
      await expect(page).toHaveURL(/\/forbidden$/u)
    }
  }
})
