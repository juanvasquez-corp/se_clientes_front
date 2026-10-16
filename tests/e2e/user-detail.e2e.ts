import { expect, test, type Page, type Route } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

import type { UserResponse } from '../../src/contracts/schemas/user'
import { waitForE2EBackend } from '../../src/test/e2e-backend-readiness'
import { resolveE2EOrigins } from '../../src/test/e2e-origins'

const { apiBaseUrl, frontendOrigin } = resolveE2EOrigins(process.env)
const realUsersEnabled = process.env.RUN_REAL_USERS_E2E === '1'
const ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
type Role = 'superadmin' | 'master' | 'visualizer'

const tokens = {
  access_token: 'user-detail-access',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'user-detail-csrf',
} as const

const account: UserResponse = {
  uuid: ACCOUNT_UUID,
  name: 'Ana',
  last_name: 'Gómez',
  email: 'ana@example.com',
  phone_number: null,
  role: 'superadmin',
  is_active: true,
}

const other: UserResponse = {
  uuid: OTHER_UUID,
  name: 'Carlos',
  last_name: 'Ramírez',
  email: 'carlos@example.com',
  phone_number: '+57 310 555 0199',
  role: 'master',
  is_active: true,
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
      'Access-Control-Allow-Origin': frontendOrigin,
    },
  })
  return true
}

function profileFor(role: Role): UserResponse {
  return { ...account, role }
}

async function mockSession(
  page: Page,
  role: Role = 'superadmin',
  refreshStatus: 200 | 401 = 200,
) {
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: { csrf_token: 'user-detail-csrf' } })
  })
  await page.route(endpoint('/auth/refresh'), async (route) => {
    if (await preflight(route)) return
    if (refreshStatus === 401) {
      await route.fulfill({ status: 401, json: { detail: 'expired' } })
      return
    }
    await route.fulfill({ json: tokens })
  })
  await page.route(endpoint('/users/me'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: profileFor(role) })
  })
}

async function expectAxe(page: Page) {
  await page.addScriptTag({ content: axe.source })
  const results = await page.evaluate<AxeResults>(async () =>
    window.axe.run(document),
  )
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)
}

async function expectMinTouchTarget(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
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
  Reflect.set(page, '__userDetailFailures', failures)
})

test.afterEach(({ page }) => {
  const failures = Reflect.get(page, '__userDetailFailures') as unknown
  expect(Array.isArray(failures) ? failures : []).toEqual([])
})

test('renders third-party and own user detail with six public fields, privacy guarantees, edit link and self restriction notice (RF-1–RF-6, RNF-1–RNF-4)', async ({
  page,
}) => {
  await mockSession(page, 'superadmin')
  const requestedUrls: string[] = []
  await page.route(endpoint(`/users/${OTHER_UUID}`), async (route) => {
    if (await preflight(route)) return
    requestedUrls.push(new URL(route.request().url()).pathname)
    await route.fulfill({ json: other })
  })
  await page.route(endpoint(`/users/${ACCOUNT_UUID}`), async (route) => {
    if (await preflight(route)) return
    requestedUrls.push(new URL(route.request().url()).pathname)
    await route.fulfill({ json: account })
  })

  await page.goto(`${frontendOrigin}/users/${OTHER_UUID.toUpperCase()}`)
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`, 'iu'))
  await expect(
    page.getByRole('heading', { level: 1, name: 'Detalle de usuario' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Carlos Ramírez' }),
  ).toBeVisible()
  expect(requestedUrls).toEqual([`/api/users/${OTHER_UUID}`])

  const breadcrumb = page.getByRole('navigation', { name: 'Ruta de navegación' })
  await expect(breadcrumb).toHaveAttribute('data-breadcrumb-viewport', 'desktop')
  await expect(breadcrumb.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
    'href',
    '/users',
  )
  await expect(breadcrumb.getByText('Carlos Ramírez')).toHaveAttribute(
    'aria-current',
    'page',
  )

  const detailCard = page.getByRole('region', {
    name: 'Contenido del detalle de usuario',
  })
  await expect(detailCard.getByText('Carlos', { exact: true })).toBeVisible()
  await expect(detailCard.getByText('Ramírez', { exact: true })).toBeVisible()
  await expect(
    detailCard.getByText('carlos@example.com', { exact: true }),
  ).toBeVisible()
  await expect(
    detailCard.getByText('+57 310 555 0199', { exact: true }),
  ).toBeVisible()
  await expect(detailCard.getByText('Master', { exact: true })).toBeVisible()
  await expect(detailCard.getByText('Activo', { exact: true })).toBeVisible()

  const editLink = page.getByRole('link', { name: 'Editar usuario' })
  await expect(editLink).toHaveAttribute('href', `/users/${OTHER_UUID}/edit`)
  await expectMinTouchTarget(editLink)
  await expect(
    page.getByRole('button', { name: /activar|desactivar|eliminar/iu }),
  ).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(
    /cédula|document_number|contraseña|password|hash|fecha|created_at|updated_at/iu,
  )
  await expect(page.locator('body')).not.toContainText(OTHER_UUID)
  await expectAxe(page)

  await page.goto(`${frontendOrigin}/users/${ACCOUNT_UUID}`)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ana Gómez' }),
  ).toBeVisible()
  await expect(detailCard.getByText('No informado')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Editar usuario' }),
  ).toHaveAttribute('href', `/users/${ACCOUNT_UUID}/edit`)
  await expect(
    page.getByText(
      'Tu rol y tu estado no pueden modificarse desde tu propia cuenta, ni puedes eliminarla.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /activar|desactivar|eliminar/iu }),
  ).toHaveCount(0)
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 })
})

test('rejects invalid UUID without detail request and handles 404, network, 503, 403 and 401 session outcomes (RF-1, RF-7)', async ({
  page,
}) => {
  await mockSession(page, 'superadmin')
  let detailRequests = 0
  let mode: '404' | 'network' | '503' | '403' | '401' | '200' = '404'

  await page.route(`${endpoint('/users')}?*`, async (route) => {
    if (await preflight(route)) return
    await route.fulfill({
      json: {
        total_records: 1,
        current_page: 1,
        total_pages: 1,
        page_size: 10,
        data: [other],
      },
    })
  })
  await page.route(`${endpoint('/users')}/*`, async (route) => {
    if (await preflight(route)) return
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/me')) {
      await route.fulfill({ json: profileFor('superadmin') })
      return
    }
    detailRequests += 1
    if (mode === '404') {
      await route.fulfill({
        status: 404,
        json: { detail: 'private-not-found-detail' },
      })
      return
    }
    if (mode === 'network') {
      await route.abort('failed')
      return
    }
    if (mode === '503') {
      await route.fulfill({ status: 503, json: { detail: 'unavailable' } })
      return
    }
    if (mode === '403') {
      await route.fulfill({ status: 403, json: { detail: 'forbidden' } })
      return
    }
    if (mode === '401') {
      await route.fulfill({ status: 401, json: { detail: 'unauthorized' } })
      return
    }
    await route.fulfill({ json: other })
  })

  await page.goto(`${frontendOrigin}/users/1023456789`)
  await expect(page).toHaveURL(/\/forbidden$/u)
  expect(detailRequests).toBe(0)
  await expect(page.locator('body')).not.toContainText('1023456789')

  await page.goto(`${frontendOrigin}/users/${OTHER_UUID}`)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Usuario no encontrado' }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`))
  await expect(page.locator('body')).not.toContainText('private-not-found-detail')
  await expect(page.locator('body')).not.toContainText(OTHER_UUID)
  expect(detailRequests).toBe(1)

  await page
    .getByRole('region', { name: 'Contenido del detalle de usuario' })
    .getByRole('link', { name: 'Volver a usuarios' })
    .click()
  await expect(page).toHaveURL(/\/users$/u)

  mode = 'network'
  await page.goto(`${frontendOrigin}/users/${OTHER_UUID}`)
  await expect(page.getByText('Detalle no disponible')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`))
  expect(detailRequests).toBe(2)

  mode = '503'
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('Detalle no disponible')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`))
  expect(detailRequests).toBe(3)

  mode = '200'
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Carlos Ramírez' }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`))
  expect(detailRequests).toBe(4)

  mode = '403'
  await page.reload()
  await expect(page.getByText('Acceso denegado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`))

  await page.unrouteAll({ behavior: 'wait' })
  await mockSession(page, 'superadmin', 401)
  await page.route(endpoint(`/users/${OTHER_UUID}`), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ status: 401, json: { detail: 'unauthorized' } })
  })
  await page.goto(`${frontendOrigin}/users/${OTHER_UUID}`)
  await expect(page).toHaveURL(/\/login$/u)
})

test('shows confirmed updated data on contextual reload of the same UUID and transitions to not-found on subsequent 404 (RF-8)', async ({
  page,
}) => {
  await mockSession(page, 'superadmin')
  let state: 'initial' | 'updated' | 'deleted' = 'initial'

  await page.route(endpoint(`/users/${OTHER_UUID}`), async (route) => {
    if (await preflight(route)) return
    if (state === 'deleted') {
      await route.fulfill({ status: 404, json: { detail: 'deleted' } })
      return
    }
    if (state === 'updated') {
      await route.fulfill({
        json: {
          ...other,
          name: 'Carlos Alberto',
          last_name: null,
          email: 'carlos.alberto@example.com',
          phone_number: null,
          role: 'visualizer',
          is_active: false,
        },
      })
      return
    }
    await route.fulfill({ json: other })
  })

  await page.goto(`${frontendOrigin}/users/${OTHER_UUID}`)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Carlos Ramírez' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Editar usuario' }).click()
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}/edit$`))
  await expect(
    page.getByRole('region', { name: 'Edición de usuario pendiente' }),
  ).toHaveCount(1)

  state = 'updated'
  await page.goto(`${frontendOrigin}/users/${OTHER_UUID}`)
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`))
  await expect(
    page.getByRole('heading', { level: 2, name: 'Carlos Alberto' }),
  ).toBeVisible()
  const detailRegion = page.getByRole('region', {
    name: 'Contenido del detalle de usuario',
  })
  await expect(detailRegion.getByText('carlos.alberto@example.com')).toBeVisible()
  await expect(detailRegion.getByText('Visualizador')).toBeVisible()
  await expect(detailRegion.getByText('Inactivo')).toBeVisible()
  await expect(detailRegion.getByText('No informado')).toHaveCount(2)

  state = 'deleted'
  await page.reload()
  await expect(page).toHaveURL(new RegExp(`/users/${OTHER_UUID}$`))
  await expect(
    page.getByRole('heading', { level: 2, name: 'Usuario no encontrado' }),
  ).toBeVisible()
})

test('renders compact mobile breadcrumb and 44px touch controls at 390px with no overflow or serious axe violations (RF-3, RNF-2, RNF-3)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSession(page, 'superadmin')
  await page.route(`${endpoint('/users')}?*`, async (route) => {
    if (await preflight(route)) return
    await route.fulfill({
      json: {
        total_records: 1,
        current_page: 1,
        total_pages: 1,
        page_size: 10,
        data: [other],
      },
    })
  })
  await page.route(endpoint(`/users/${OTHER_UUID}`), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: other })
  })

  await page.goto(`${frontendOrigin}/users/${OTHER_UUID}`)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Carlos Ramírez' }),
  ).toBeVisible()

  const breadcrumb = page.getByRole('navigation', { name: 'Ruta de navegación' })
  await expect(breadcrumb).toHaveAttribute('data-breadcrumb-viewport', 'mobile')
  const backLink = breadcrumb.getByRole('link', { name: 'Volver a usuarios' })
  await expect(backLink).toBeVisible()
  await expectMinTouchTarget(backLink)
  await expectMinTouchTarget(page.getByRole('link', { name: 'Editar usuario' }))

  await expectNoOverflow(page)
  await expectAxe(page)

  await backLink.click()
  await expect(page).toHaveURL(/\/users$/u)
})

for (const role of ['master', 'visualizer'] as const) {
  test(`${role} direct detail access is forbidden before any user detail request`, async ({
    page,
  }) => {
    await mockSession(page, role)
    let detailRequests = 0
    await page.route(endpoint(`/users/${OTHER_UUID}`), async (route) => {
      detailRequests += 1
      await route.fulfill({ json: other })
    })

    await page.goto(`${frontendOrigin}/users/${OTHER_UUID}`)
    await expect(page).toHaveURL(/\/forbidden$/u)
    expect(detailRequests).toBe(0)
    await expect(
      page.getByRole('heading', { name: 'Detalle de usuario' }),
    ).toHaveCount(0)
  })
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`Falta ${name}.`)
  }
  return value
}

test('real backend reads user detail by public UUID for superadmin and forbids other roles', async ({
  context,
  page,
}) => {
  test.skip(
    !realUsersEnabled,
    'Requiere RUN_REAL_USERS_E2E=1 y credenciales locales.',
  )
  await waitForE2EBackend({ enabled: realUsersEnabled, apiBaseUrl })
  const credentials = [
    [
      'superadmin',
      requiredEnvironment('E2E_SUPERADMIN_EMAIL'),
      requiredEnvironment('E2E_SUPERADMIN_PASSWORD'),
    ],
    [
      'master',
      requiredEnvironment('E2E_MASTER_EMAIL'),
      requiredEnvironment('E2E_MASTER_PASSWORD'),
    ],
    [
      'visualizer',
      requiredEnvironment('E2E_VISUALIZER_EMAIL'),
      requiredEnvironment('E2E_VISUALIZER_PASSWORD'),
    ],
  ] as const

  const writeMethods: string[] = []
  page.on('request', (request) => {
    const method = request.method().toUpperCase()
    const pathname = new URL(request.url()).pathname
    if (
      pathname.startsWith('/api/users') &&
      pathname !== '/api/users/search' &&
      (method === 'POST' ||
        method === 'PUT' ||
        method === 'PATCH' ||
        method === 'DELETE')
    ) {
      writeMethods.push(method)
    }
  })

  try {
    let discoveredDetailPath: string | null = null

    for (const [role, email, password] of credentials) {
      await context.clearCookies()
      await page.goto(`${frontendOrigin}/login`)
      await page
        .getByRole('textbox', { name: /correo electrónico/iu })
        .fill(email)
      await page.getByLabel(/^contraseña.*obligatorio/iu).fill(password)
      const loginResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/auth/login' &&
          response.request().method().toUpperCase() === 'POST',
      )
      await page.getByRole('button', { name: 'Ingresar' }).click()
      const loginResponse = await loginResponsePromise

      if (role === 'superadmin') {
        await expect(page).toHaveURL(/\/users$/u)
        const table = page.getByRole('table', { name: 'Directorio de usuarios' })
        await expect(table).toBeVisible()

        const search = page.getByRole('textbox', {
          name: /correo electrónico/iu,
        })
        await search.fill(email)
        await page.getByRole('button', { name: 'Buscar' }).click()

        const ownDetailLink = table
          .getByRole('link', { name: /ver detalle de/iu })
          .first()
        await expect(ownDetailLink).toBeVisible()
        const ownDetailPath = await ownDetailLink.getAttribute('href')
        if (ownDetailPath === null) {
          throw new Error('No se encontró enlace público al detalle propio.')
        }
        discoveredDetailPath = ownDetailPath

        await ownDetailLink.click()
        await expect(
          page.getByRole('heading', { level: 1, name: 'Detalle de usuario' }),
        ).toBeVisible()
        await expect(
          page.getByText(
            'Tu rol y tu estado no pueden modificarse desde tu propia cuenta, ni puedes eliminarla.',
          ),
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: 'Editar usuario' }),
        ).toHaveAttribute('href', `${ownDetailPath}/edit`)
        await expect(
          page.getByRole('button', { name: /activar|desactivar|eliminar/iu }),
        ).toHaveCount(0)
        await expect(page.locator('body')).not.toContainText(
          /cédula|document_number|contraseña|password|hash|created_at|updated_at/iu,
        )

        await page
          .getByRole('navigation', { name: 'Ruta de navegación' })
          .getByRole('link', { name: 'Usuarios' })
          .click()
        await expect(page).toHaveURL(/\/users$/u)
        const allDetailLinks = table.getByRole('link', {
          name: /ver detalle de/iu,
        })
        const linkCount = await allDetailLinks.count()
        for (let index = 0; index < linkCount; index += 1) {
          const candidateHref = await allDetailLinks
            .nth(index)
            .getAttribute('href')
          if (candidateHref !== null && candidateHref !== ownDetailPath) {
            discoveredDetailPath = candidateHref
            await allDetailLinks.nth(index).click()
            await expect(
              page.getByRole('heading', {
                level: 1,
                name: 'Detalle de usuario',
              }),
            ).toBeVisible()
            await expect(
              page.getByRole('link', { name: 'Editar usuario' }),
            ).toHaveAttribute('href', `${candidateHref}/edit`)
            await expect(
              page.getByRole('button', {
                name: /activar|desactivar|eliminar/iu,
              }),
            ).toHaveCount(0)
            await expect(
              page.getByText(
                'Tu rol y tu estado no pueden modificarse desde tu propia cuenta, ni puedes eliminarla.',
              ),
            ).toHaveCount(0)
            await expect(page.locator('body')).not.toContainText(
              /cédula|document_number|contraseña|password|hash|created_at|updated_at/iu,
            )
            break
          }
        }
      } else {
        if (discoveredDetailPath === null) {
          throw new Error('Se requería una ruta de detalle descubierta.')
        }
        const targetDetailPath = discoveredDetailPath

        let unauthorizedDetailGetCount = 0
        const countDetailRequest = (request: {
          url: () => string
          method: () => string
        }) => {
          if (
            request.method().toUpperCase() === 'GET' &&
            new URL(request.url()).pathname === `/api${targetDetailPath}`
          ) {
            unauthorizedDetailGetCount += 1
          }
        }
        page.on('request', countDetailRequest)
        try {
          if (loginResponse.status() === 200) {
            await expect(page).toHaveURL(/\/profile$/u)
          } else {
            await mockSession(page, role)
          }
          await page.goto(`${frontendOrigin}${targetDetailPath}`)
          await expect(page).toHaveURL(/\/forbidden$/u)
          expect(unauthorizedDetailGetCount).toBe(0)
        } finally {
          page.off('request', countDetailRequest)
          await page.unrouteAll({ behavior: 'ignoreErrors' })
        }
      }
    }

    expect(writeMethods).toEqual([])
  } finally {
    if (!page.isClosed()) {
      await page
        .evaluate(() => {
          for (const input of document.querySelectorAll('input')) {
            input.value = ''
          }
          localStorage.clear()
          sessionStorage.clear()
        })
        .catch(() => undefined)
    }
    await context.clearCookies()
  }
})
