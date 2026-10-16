import { expect, test, type Page, type Route } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

import { resolveE2EOrigins } from '../../src/test/e2e-origins'

const { apiBaseUrl } = resolveE2EOrigins(process.env)
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
type Role = 'superadmin' | 'master' | 'visualizer'

const tokens = {
  access_token: 'navigation-access',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'navigation-csrf',
} as const

function profile(role: Role) {
  return {
    uuid: USER_UUID,
    name: 'Navigation',
    last_name: 'Fixture',
    email: 'navigation@example.test',
    phone_number: null,
    role,
    is_active: true,
  } as const
}

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
      'Access-Control-Allow-Origin': 'http://localhost:5173',
    },
  })
  return true
}

async function mockDeadSession(page: Page) {
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ status: 401, json: { detail: 'dead session' } })
  })
}

async function mockEmptyDirectory(page: Page) {
  await page.route(`${endpoint('/users')}?*`, async (route) => {
    if (await preflight(route)) return
    await route.fulfill({
      json: {
        total_records: 0,
        current_page: 1,
        total_pages: 1,
        page_size: 10,
        data: [],
      },
    })
  })
}

async function mockRestoredSession(page: Page, role: Role) {
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: { csrf_token: 'restore-csrf' } })
  })
  await page.route(endpoint('/auth/refresh'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: tokens })
  })
  await page.route(endpoint('/users/me'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: profile(role) })
  })
  if (role === 'superadmin') await mockEmptyDirectory(page)
}

async function mockLogin(page: Page, role: Role) {
  await mockDeadSession(page)
  await page.route(endpoint('/auth/login'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: tokens })
  })
  await page.route(endpoint('/users/me'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: profile(role) })
  })
  if (role === 'superadmin') await mockEmptyDirectory(page)
}

async function submitLogin(page: Page) {
  await page.getByRole('textbox', { name: /correo electrónico/i }).fill(
    'navigation@example.test',
  )
  await page.getByLabel(/^contraseña.*obligatorio/i).fill('navigation-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    })),
  ).toEqual(
    expect.objectContaining({
      client: expect.any(Number),
      scroll: expect.any(Number),
    }),
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)
}

test.beforeEach(({ page }) => {
  const failures: string[] = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().startsWith('Failed to load resource:')
    ) {
      failures.push(message.text())
    }
  })
  page.on('pageerror', (error) => failures.push(error.message))
  Reflect.set(page, '__navigationFailures', failures)
})

test.afterEach(({ page }) => {
  const failures = Reflect.get(page, '__navigationFailures') as unknown
  expect(Array.isArray(failures) ? failures : []).toEqual([])
})

test('declares only normative direct routes and sends absent private/root/unknown to login', async ({
  page,
}) => {
  await mockDeadSession(page)
  for (const path of [
    '/',
    '/profile',
    '/users',
    '/users/new',
    `/users/${USER_UUID}`,
    `/users/${USER_UUID}/edit`,
    '/dashboard',
    '/register',
    '/recovery',
  ]) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/u)
    await expect(page.getByRole('form', { name: 'Inicio de sesión' })).toBeVisible()
  }
})

for (const [role, home] of [
  ['superadmin', '/users'],
  ['master', '/profile'],
  ['visualizer', '/profile'],
] as const) {
  test(`restored and newly logged-in ${role} always reaches ${home}`, async ({ page }) => {
    await mockRestoredSession(page, role)
    await page.goto('/login?next=https%3A%2F%2Fevil.example#ignored')
    await expect(page).toHaveURL(new RegExp(`${home}$`))
    const desktopNavigation = page.getByRole('navigation', {
      name: 'Navegación principal',
    })
    await expect(desktopNavigation.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
    await expect(desktopNavigation.getByRole('link', { name: 'Usuarios' })).toHaveCount(
      role === 'superadmin' ? 1 : 0,
    )
    await page.unrouteAll({ behavior: 'wait' })

    await mockLogin(page, role)
    await page.goto('/login?returnTo=%2Fusers%2Fnew&redirect=%2F%2Fevil.example')
    await submitLogin(page)
    await expect(page).toHaveURL(new RegExp(`${home}$`))
  })
}

test('direct public state routes resolve controlled restoration failures', async ({ page }) => {
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ status: 403, json: { detail: 'forbidden' } })
  })
  await page.goto('/forbidden')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible()

  await page.unrouteAll({ behavior: 'wait' })
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ status: 503, json: { detail: 'unavailable' } })
  })
  await page.goto('/unavailable')
  await expect(page).toHaveURL(/\/unavailable$/u)
  await expect(page.getByRole('heading', { name: 'Servicio no disponible' })).toBeVisible()
})

for (const role of ['master', 'visualizer'] as const) {
  test(`${role} is forbidden from every users route`, async ({ page }) => {
    await mockRestoredSession(page, role)
    for (const path of [
      '/users',
      '/users/new',
      `/users/${USER_UUID}`,
      `/users/${USER_UUID}/edit`,
    ]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/forbidden$/u)
      await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible()
      await expect(page.getByRole('navigation')).toHaveCount(0)
    }
  })
}

test('superadmin opens real directory and keeps only child users routes as placeholders', async ({
  page,
}) => {
  await mockRestoredSession(page, 'superadmin')
  await page.route(`${endpoint('/users')}?*`, async (route) => {
    if (await preflight(route)) return
    await route.fulfill({
      json: {
        total_records: 0,
        current_page: 1,
        total_pages: 1,
        page_size: 10,
        data: [],
      },
    })
  })
  await page.goto('/users')
  await expect(page).toHaveURL(/\/users$/u)
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Usuarios pendiente' })).toHaveCount(0)

  for (const [path, region] of [
    ['/users/new', 'Creación de usuario pendiente'],
    [`/users/${USER_UUID}`, 'Detalle de usuario pendiente'],
    [`/users/${USER_UUID}/edit`, 'Edición de usuario pendiente'],
  ] as const) {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('region', { name: region })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
})

test('absent private destination is never restored after master login', async ({ page }) => {
  await mockLogin(page, 'master')
  await page.goto('/users/new?returnTo=%2Fusers%2Fnew#detail')
  await expect(page).toHaveURL(/\/login$/u)
  await submitLogin(page)
  await expect(page).toHaveURL(/\/profile$/u)
})

test('delayed restoration never flashes private content and unavailable retry recovers', async ({
  page,
}) => {
  let csrfCalls = 0
  let releaseFirst: (() => void) | undefined
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    csrfCalls += 1
    if (csrfCalls === 1) {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      await route.fulfill({ status: 503, json: { detail: 'unavailable' } })
      return
    }
    await route.fulfill({ json: { csrf_token: 'retry-csrf' } })
  })
  await page.route(endpoint('/auth/refresh'), (route) => route.fulfill({ json: tokens }))
  await page.route(endpoint('/users/me'), (route) =>
    route.fulfill({ json: profile('master') }),
  )

  await page.goto('/profile')
  await expect(page.getByRole('status')).toContainText('Restaurando sesión')
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect.poll(() => releaseFirst !== undefined).toBe(true)
  releaseFirst?.()
  await expect(page).toHaveURL(/\/unavailable$/u)
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page).toHaveURL(/\/profile$/u)
})

test('mobile menu filters, closes by keyboard and focuses main after navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockRestoredSession(page, 'superadmin')
  await page.goto('/users')
  const trigger = page.getByRole('button', { name: 'Abrir menú' })
  await trigger.click()
  const mobileNav = page.getByRole('navigation', { name: 'Navegación móvil' })
  await expect(mobileNav.getByRole('link', { name: 'Usuarios' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await mobileNav.getByRole('link', { name: 'Mi perfil' }).click()
  await expect(page).toHaveURL(/\/profile$/u)
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(mobileNav).toHaveCount(0)
  await expectNoOverflow(page)
})

for (const role of ['master', 'visualizer'] as const) {
  test(`mobile ${role} menu omits Usuarios from the DOM`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockRestoredSession(page, role)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const mobileNav = page.getByRole('navigation', { name: 'Navegación móvil' })
    await expect(mobileNav.getByText('Usuarios')).toHaveCount(0)
    await expect(mobileNav.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
    await expect(mobileNav.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  })
}

test('public state routes and page transitions remain accessible with reduced motion', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/app-shell.html?state=blocked')
  await expect(page.getByRole('heading', { name: 'Protección de sesión' })).toBeVisible()
  await page.goto('/tests/fixtures/app-shell.html?state=unavailable')
  await expect(page.getByRole('heading', { name: 'Servicio no disponible' })).toBeVisible()
  await page.addScriptTag({ content: axe.source })
  const results: AxeResults = await page.evaluate(() => window.axe.run())
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])
  expect(
    await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some(
            (rule) =>
              rule.cssText.includes('prefers-reduced-motion: reduce') &&
              rule.cssText.includes('::view-transition'),
          )
        } catch {
          return false
        }
      }),
    ),
  ).toBe(true)
})
