import { expect, test, type Page, type Route } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

import { resolveE2EOrigins } from '../../src/test/e2e-origins'

declare global {
  interface Window {
    __capturedSessionSignals?: unknown[]
    __sessionFixture?: {
      close: () => void
      messages: () => readonly string[]
      runConcurrentReads: () => Promise<readonly string[]>
      runMutation: () => Promise<string>
      state: () => {
        cacheEntries: number
        hasUsableAccess: boolean
        hasUsableCsrf: boolean
        mode: 'coordinated' | 'limited'
        path: string
        status: string
      }
    }
  }
}

const { apiBaseUrl } = resolveE2EOrigins(process.env)
const fixture = '/tests/fixtures/session-lifecycle.html'
const loginFixture = '/tests/fixtures/login-page.html?real=1'
const realSessionEnabled = process.env.RUN_REAL_LOGIN_E2E === '1'
interface FixtureProfile {
  readonly uuid: string
  readonly name: string
  readonly last_name: string | null
  readonly email: string
  readonly phone_number: string | null
  readonly rol: 'superadmin' | 'master' | 'visualizer'
  readonly is_active: boolean
}

const profile: FixtureProfile = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Fixture',
  last_name: null,
  email: ['fixture', 'example.test'].join('@'),
  phone_number: null,
  rol: 'superadmin',
  is_active: true,
}
const tokens = {
  access_token: 'fixture-renewed-access',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'fixture-renewed-csrf',
} as const

type Step = 'csrf' | 'refresh' | 'profile'
type Failure = '401' | '403' | '503' | 'network'

function endpoint(path: string): string {
  return `${apiBaseUrl.replace(/\/$/u, '')}${path}`
}

async function failure(route: Route, kind: Failure) {
  if (kind === 'network') {
    await route.abort('failed')
    return
  }
  await route.fulfill({
    status: Number(kind),
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'controlled failure' }),
  })
}

async function handlePreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') return false
  await route.fulfill({
    status: 204,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': 'http://localhost:5173',
    },
  })
  return true
}

async function mockRestoration(
  page: Page,
  options: {
    fail?: { step: Step; kind: Failure }
    restoredProfile?: typeof profile
    order?: Step[]
  } = {},
) {
  const order = options.order ?? []
  await page.route(endpoint('/auth/csrf'), async (route) => {
    order.push('csrf')
    if (options.fail?.step === 'csrf') return failure(route, options.fail.kind)
    await route.fulfill({ json: { csrf_token: 'fixture-restoration-csrf' } })
  })
  await page.route(endpoint('/auth/refresh'), async (route) => {
    order.push('refresh')
    expect(route.request().headers()['x-requested-with']).toBe('XMLHttpRequest')
    expect(route.request().headers()['x-csrf-token']).toBeDefined()
    if (options.fail?.step === 'refresh') return failure(route, options.fail.kind)
    await route.fulfill({ json: tokens })
  })
  await page.route(endpoint('/users/me'), async (route) => {
    order.push('profile')
    expect(route.request().headers().authorization).toBeDefined()
    if (options.fail?.step === 'profile') return failure(route, options.fail.kind)
    await route.fulfill({ json: options.restoredProfile ?? profile })
  })
  return order
}

async function state(page: Page) {
  return page.evaluate(() => window.__sessionFixture?.state())
}

async function expectNoStorage(page: Page) {
  await expect(
    page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).resolves.toEqual({ local: 0, session: 0 })
}

async function captureSessionSignals(page: Page) {
  await page.addInitScript(() => {
    const NativeBroadcastChannel = window.BroadcastChannel
    window.__capturedSessionSignals = []
    const nativePostMessage: unknown = Object.getOwnPropertyDescriptor(
      NativeBroadcastChannel.prototype,
      'postMessage',
    )?.value
    if (typeof nativePostMessage !== 'function') return
    NativeBroadcastChannel.prototype.postMessage = function postMessage(
      message: unknown,
    ) {
      window.__capturedSessionSignals?.push(message)
      Reflect.apply(nativePostMessage, this, [message])
    }
  })
}

async function mockAppLogin(
  page: Page,
  restoredProfile: typeof profile,
  tokenSuffix: string,
) {
  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await handlePreflight(route)) return
    await route.fulfill({ status: 401, json: { detail: 'no previous session' } })
  })
  await page.route(endpoint('/auth/login'), async (route) => {
    if (await handlePreflight(route)) return
    await route.fulfill({
      json: {
        ...tokens,
        access_token: `fixture-login-${tokenSuffix}`,
        csrf_token: `fixture-csrf-${tokenSuffix}`,
      },
    })
  })
  await page.route(endpoint('/users/me'), async (route) => {
    if (await handlePreflight(route)) return
    await route.fulfill({ json: restoredProfile })
  })
}

async function submitAppLogin(page: Page) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: /correo electrónico/i }).fill(
    ['fixture', 'example.test'].join('@'),
  )
  await page.getByLabel(/^contraseña.*obligatorio/i).fill('fixture-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`Falta la variable local requerida: ${name}.`)
  }
  return value
}

test.describe('session lifecycle fixture', () => {
  for (const initialPath of ['/login', '/unavailable', '/unknown'] as const) {
    test(`real app restores before resolving ${initialPath}`, async ({ page }) => {
      const order: Step[] = []
      let releaseCsrf: (() => void) | undefined
      const restoredProfile: FixtureProfile = { ...profile, rol: 'master' }
      await page.route(endpoint('/auth/csrf'), async (route) => {
        if (await handlePreflight(route)) return
        order.push('csrf')
        await new Promise<void>((resolve) => {
          releaseCsrf = resolve
        })
        await route.fulfill({ json: { csrf_token: 'fixture-restoration-csrf' } })
      })
      await page.route(endpoint('/auth/refresh'), async (route) => {
        if (await handlePreflight(route)) return
        order.push('refresh')
        await route.fulfill({ json: tokens })
      })
      await page.route(endpoint('/users/me'), async (route) => {
        if (await handlePreflight(route)) return
        order.push('profile')
        await route.fulfill({ json: restoredProfile })
      })

      await page.goto(initialPath)
      await expect(page.getByRole('status')).toContainText('Restaurando sesión')
      await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0)
      await expect.poll(() => releaseCsrf !== undefined).toBe(true)
      releaseCsrf?.()

      await expect(page).toHaveURL(
        initialPath === '/unknown' ? /\/forbidden$/u : /\/profile$/u,
      )
      if (initialPath === '/unknown') {
        await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible()
      } else {
        await expect(
          page.getByRole('navigation', { name: 'Navegación principal' }),
        ).toBeVisible()
      }
      expect(order).toEqual(['csrf', 'refresh', 'profile'])
    })
  }

  test('the real app root mounts bootstrap and hides private content', async ({ page }) => {
    let releaseCsrf: (() => void) | undefined
    await page.route(endpoint('/auth/csrf'), async (route) => {
      await new Promise<void>((resolve) => {
        releaseCsrf = resolve
      })
      await route.fulfill({ json: { csrf_token: 'fixture-restoration-csrf' } })
    })
    await page.route(endpoint('/auth/refresh'), (route) => route.fulfill({ json: tokens }))
    await page.route(endpoint('/users/me'), (route) => route.fulfill({ json: profile }))

    await page.goto('/')
    await expect(page.getByRole('status')).toContainText('Restaurando sesión')
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0)
    await expect.poll(() => releaseCsrf !== undefined).toBe(true)
    releaseCsrf?.()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
  })

  test('hides private content until ordered restoration succeeds', async ({ page }) => {
    const order: Step[] = []
    let releaseCsrf: (() => void) | undefined
    await page.route(endpoint('/auth/csrf'), async (route) => {
      order.push('csrf')
      await new Promise<void>((resolve) => {
        releaseCsrf = resolve
      })
      await route.fulfill({ json: { csrf_token: 'fixture-restoration-csrf' } })
    })
    await page.route(endpoint('/auth/refresh'), async (route) => {
      order.push('refresh')
      await route.fulfill({ json: tokens })
    })
    await page.route(endpoint('/users/me'), async (route) => {
      order.push('profile')
      await route.fulfill({ json: profile })
    })

    await page.goto(fixture)
    await expect(page.getByRole('status')).toContainText('Restaurando sesión')
    await expect(page.getByRole('heading', { name: 'Contenido privado' })).toHaveCount(0)
    await expect.poll(() => releaseCsrf !== undefined).toBe(true)
    releaseCsrf?.()
    await expect(page.getByRole('heading', { name: 'Contenido privado' })).toBeVisible()

    expect(order).toEqual(['csrf', 'refresh', 'profile'])
    expect(await state(page)).toMatchObject({
      status: 'authenticated',
      hasUsableAccess: true,
      hasUsableCsrf: true,
    })
    await expectNoStorage(page)
  })

  for (const step of ['csrf', 'refresh', 'profile'] as const) {
    for (const kind of ['401', '503'] as const) {
      test(`${step} ${kind} produces the safe initial outcome`, async ({ page }) => {
        const order = await mockRestoration(page, { fail: { step, kind } })
        await page.goto(fixture)
        const expectedStatus = kind === '401' ? 'dead' : 'unavailable'
        const expectedPath = kind === '401' ? '/login' : '/unavailable'

        await expect.poll(async () => (await state(page))?.status).toBe(expectedStatus)
        expect((await state(page))?.path).toBe(expectedPath)
        await expect(page.getByRole('heading', { name: 'Contenido privado' })).toHaveCount(0)
        expect(order.at(-1)).toBe(step)
        expect(order.filter((value) => value === step)).toHaveLength(1)
      })
    }
  }

  test('shares one refresh for concurrent reads and never replays a mutation', async ({
    page,
  }) => {
    let refreshRequests = 0
    let readRequests = 0
    let mutationRequests = 0
    await page.route(endpoint('/auth/refresh'), async (route) => {
      refreshRequests += 1
      await route.fulfill({ json: tokens })
    })
    await page.route(endpoint('/users/me'), async (route) => {
      readRequests += 1
      const authorization = route.request().headers().authorization
      if (authorization?.includes('fixture-access') === true) {
        await route.fulfill({ status: 401, json: { detail: 'expired' } })
      } else {
        await route.fulfill({ json: profile })
      }
    })
    await page.route(endpoint('/users/search'), async (route) => {
      mutationRequests += 1
      await route.fulfill({ status: 401, json: { detail: 'expired' } })
    })
    await page.goto(`${fixture}?seeded=1`)

    await expect(
      page.evaluate(() => window.__sessionFixture?.runConcurrentReads()),
    ).resolves.toEqual(['success', 'success'])
    expect(refreshRequests).toBe(1)
    expect(readRequests).toBe(4)

    await expect(
      page.evaluate(() => window.__sessionFixture?.runMutation()),
    ).resolves.toBe('requires-confirmation')
    expect(mutationRequests).toBe(1)
  })

  test('limited mode warns and keeps a single tab operational', async ({ page }) => {
    await page.goto(`${fixture}?seeded=1&limited=1`)
    await expect(page.getByRole('status')).toContainText(
      'Si usas varias pestañas',
    )
    expect((await state(page))?.mode).toBe('limited')
    await expect(page.getByRole('heading', { name: 'Contenido privado' })).toBeVisible()
    await expectNoStorage(page)
  })
})

test.describe('security recovery and logout', () => {
  for (const kind of ['success', '401', '403', '503', 'network'] as const) {
    test(`manual CSRF recovery handles ${kind}`, async ({ page }) => {
      let requests = 0
      await page.route(endpoint('/auth/csrf'), async (route) => {
        requests += 1
        if (kind === 'success') {
          await route.fulfill({ json: { csrf_token: 'fixture-recovered-csrf' } })
        } else {
          await failure(route, kind)
        }
      })
      await page.goto(`${fixture}?seeded=1&blocked=refresh`)
      await expect(page.getByRole('heading', { name: 'Contenido privado' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Restablecer protección' }).click()

      const expected = {
        success: { status: 'blocked', path: '/tests/fixtures/session-lifecycle.html' },
        '401': { status: 'dead', path: '/login' },
        '403': { status: 'blocked', path: '/forbidden' },
        '503': { status: 'unavailable', path: '/unavailable' },
        network: { status: 'unavailable', path: '/unavailable' },
      }[kind]
      await expect.poll(async () => (await state(page))?.status).toBe(expected.status)
      expect(requests).toBe(1)
      expect((await state(page))?.hasUsableAccess).toBe(false)
      expect((await state(page))?.hasUsableCsrf).toBe(false)
      if (kind === 'success') {
        await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
      }
    })
  }

  test('logout cancel, unavailable retry and success preserve exact effects', async ({ page }) => {
    let requests = 0
    await page.route(endpoint('/auth/logout'), async (route) => {
      requests += 1
      if (requests === 1) {
        await route.fulfill({ status: 503, json: { detail: 'offline' } })
      } else {
        await route.fulfill({ json: { detail: 'closed' } })
      }
    })
    await page.goto(`${fixture}?seeded=1`)
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.getByRole('button', { name: 'Cancelar' }).click()
    expect(requests).toBe(0)

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
    expect(requests).toBe(1)
    expect((await state(page))?.status).toBe('authenticated')

    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect.poll(async () => (await state(page))?.status).toBe('dead')
    expect(requests).toBe(2)
    expect((await state(page))?.cacheEntries).toBe(0)
    expect((await state(page))?.path).toBe('/login')
  })

  test('logout 403 quarantines without publishing logout', async ({ page }) => {
    await page.route(endpoint('/auth/logout'), (route) =>
      route.fulfill({ status: 403, json: { detail: 'controlled' } }),
    )
    await page.goto(`${fixture}?seeded=1`)
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()

    await expect.poll(async () => (await state(page))?.status).toBe('blocked')
    expect((await state(page))?.path).toBe('/forbidden')
    expect((await state(page))?.cacheEntries).toBe(1)
    expect(await page.evaluate(() => window.__sessionFixture?.messages())).toEqual([])
    await expect(page.getByRole('button', { name: 'Restablecer protección' })).toBeVisible()
  })
})

test.describe('real browser multi-tab coordination', () => {
  test('two real login operations are serialized by navigator locks', async ({
    context,
  }) => {
    const first = await context.newPage()
    const second = await context.newPage()
    let activeLogins = 0
    let maximumLogins = 0
    let loginRequests = 0
    await context.route(endpoint('/auth/csrf'), async (route) => {
      if (await handlePreflight(route)) return
      await route.fulfill({ status: 401, json: { detail: 'no previous session' } })
    })
    await context.route(endpoint('/auth/login'), async (route) => {
      if (await handlePreflight(route)) return
      loginRequests += 1
      activeLogins += 1
      maximumLogins = Math.max(maximumLogins, activeLogins)
      await new Promise((resolve) => setTimeout(resolve, 150))
      activeLogins -= 1
      await route.fulfill({ json: tokens })
    })
    await context.route(endpoint('/users/me'), (route) =>
      route.fulfill({ json: profile }),
    )
    await Promise.all([first.goto('/login'), second.goto('/login')])
    for (const page of [first, second]) {
      await page.getByRole('textbox', { name: /correo electrónico/i }).fill(
        ['fixture', 'example.test'].join('@'),
      )
      await page.getByLabel(/^contraseña.*obligatorio/i).fill('fixture-password')
    }

    await Promise.all([
      first.getByRole('button', { name: 'Ingresar' }).click(),
      second.getByRole('button', { name: 'Ingresar' }).click(),
    ])
    await expect.poll(() => loginRequests).toBe(2)
    expect(maximumLogins).toBe(1)
  })

  test('two real refresh operations are serialized by navigator locks', async ({
    context,
  }) => {
    const first = await context.newPage()
    const second = await context.newPage()
    let activeRefreshes = 0
    let maximumRefreshes = 0
    let refreshRequests = 0
    await context.route(endpoint('/users/me'), async (route) => {
      if (await handlePreflight(route)) return
      const authorization = route.request().headers().authorization
      if (authorization?.includes('fixture-access') === true) {
        await route.fulfill({ status: 401, json: { detail: 'expired' } })
      } else {
        await route.fulfill({ json: profile })
      }
    })
    await context.route(endpoint('/auth/refresh'), async (route) => {
      if (await handlePreflight(route)) return
      refreshRequests += 1
      activeRefreshes += 1
      maximumRefreshes = Math.max(maximumRefreshes, activeRefreshes)
      await new Promise((resolve) => setTimeout(resolve, 150))
      activeRefreshes -= 1
      await route.fulfill({ json: tokens })
    })
    await Promise.all([
      first.goto(`${fixture}?seeded=1`),
      second.goto(`${fixture}?seeded=1`),
    ])
    await Promise.all([
      first.evaluate(() => window.__sessionFixture?.close()),
      second.evaluate(() => window.__sessionFixture?.close()),
    ])

    await Promise.all([
      first.evaluate(() => window.__sessionFixture?.runConcurrentReads()),
      second.evaluate(() => window.__sessionFixture?.runConcurrentReads()),
    ])
    expect(refreshRequests).toBe(2)
    expect(maximumRefreshes).toBe(1)
  })

  test('two real logout operations are serialized by navigator locks', async ({
    context,
  }) => {
    const first = await context.newPage()
    const second = await context.newPage()
    let activeLogouts = 0
    let maximumLogouts = 0
    let logoutRequests = 0
    await context.route(endpoint('/auth/logout'), async (route) => {
      if (await handlePreflight(route)) return
      logoutRequests += 1
      activeLogouts += 1
      maximumLogouts = Math.max(maximumLogouts, activeLogouts)
      await new Promise((resolve) => setTimeout(resolve, 150))
      activeLogouts -= 1
      await route.fulfill({ json: { detail: 'closed' } })
    })
    await Promise.all([
      first.goto(`${fixture}?seeded=1`),
      second.goto(`${fixture}?seeded=1`),
    ])
    await Promise.all([
      first.evaluate(() => window.__sessionFixture?.close()),
      second.evaluate(() => window.__sessionFixture?.close()),
    ])

    await Promise.all([
      (async () => {
        await first.getByRole('button', { name: 'Cerrar sesión' }).click()
        await first.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()
      })(),
      (async () => {
        await second.getByRole('button', { name: 'Cerrar sesión' }).click()
        await second.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()
      })(),
    ])
    await expect.poll(() => logoutRequests).toBe(2)
    expect(maximumLogouts).toBe(1)
  })

  for (const account of ['same', 'different'] as const) {
    test(`login in a second tab automatically signals ${account} account replacement`, async ({
      context,
    }) => {
      const receiver = await context.newPage()
      const sender = await context.newPage()
      const changedProfile = {
        ...profile,
        uuid: account === 'same' ? profile.uuid : '3a2f7a2e-46f5-4c8a-b47d-524f1f2e1c76',
        rol: account === 'same' ? 'superadmin' : 'master',
      } as const
      let receiverProfile = profile
      let profileRequests = 0
      const restorationOrder: Step[] = []
      await captureSessionSignals(sender)
      await receiver.route(endpoint('/users/me'), async (route) => {
        if (await handlePreflight(route)) return
        profileRequests += 1
        await route.fulfill({ json: receiverProfile })
      })
      await receiver.route(endpoint('/auth/csrf'), async (route) => {
        if (await handlePreflight(route)) return
        restorationOrder.push('csrf')
        await route.fulfill({ json: { csrf_token: 'replacement-csrf' } })
      })
      await receiver.route(endpoint('/auth/refresh'), async (route) => {
        if (await handlePreflight(route)) return
        restorationOrder.push('refresh')
        await route.fulfill({ json: tokens })
      })
      await mockAppLogin(sender, changedProfile, 'sender')

      await receiver.goto(`${fixture}?seeded=1`)
      await receiver.evaluate(() => {
        history.replaceState(null, '', '/users')
      })
      expect((await state(receiver))?.cacheEntries).toBe(1)
      receiverProfile = changedProfile
      await submitAppLogin(sender)

      const destination = account === 'same' ? '/users' : '/profile'
      await expect
        .poll(async () =>
          sender.evaluate(() => window.__capturedSessionSignals?.length ?? 0),
        )
        .toBe(1)
      await expect.poll(() => restorationOrder.length).toBeGreaterThanOrEqual(2)
      await expect.poll(() => profileRequests).toBe(1)
      await expect.poll(async () => (await state(receiver))?.status).toBe('authenticated')
      await expect.poll(async () => (await state(receiver))?.path).toBe(destination)
      expect((await state(receiver))?.cacheEntries).toBe(0)
      expect(restorationOrder).toEqual(['csrf', 'refresh'])
      const capturedSignals = await sender.evaluate(
        () => window.__capturedSessionSignals,
      )
      expect(capturedSignals).toEqual([
        { type: 'session-replaced' },
      ])
    })
  }
})

test.describe('RF21 cross-tab replacement matrix', () => {
  for (const step of ['csrf', 'refresh', 'profile'] as const) {
    for (const kind of ['401', '403', 'network', '503'] as const) {
      test(`${step} ${kind} stops automatic replacement restoration`, async ({
        context,
      }) => {
        const receiver = await context.newPage()
        const sender = await context.newPage()
        const order: Step[] = []
        const counts: Record<Step, number> = {
          csrf: 0,
          refresh: 0,
          profile: 0,
        }
        await receiver.goto(`${fixture}?seeded=1`)
        await receiver.evaluate(() => {
          history.replaceState(null, '', '/users')
        })
        await receiver.route(endpoint('/auth/csrf'), async (route) => {
          if (await handlePreflight(route)) return
          order.push('csrf')
          counts.csrf += 1
          if (step === 'csrf') return failure(route, kind)
          await route.fulfill({ json: { csrf_token: 'replacement-csrf' } })
        })
        await receiver.route(endpoint('/auth/refresh'), async (route) => {
          if (await handlePreflight(route)) return
          order.push('refresh')
          counts.refresh += 1
          if (step === 'refresh') return failure(route, kind)
          await route.fulfill({ json: tokens })
        })
        await receiver.route(endpoint('/users/me'), async (route) => {
          if (await handlePreflight(route)) return
          order.push('profile')
          counts.profile += 1
          if (step === 'profile') return failure(route, kind)
          await route.fulfill({ json: profile })
        })
        await mockAppLogin(sender, profile, `${step}-${kind}`)

        await submitAppLogin(sender)

        const expected =
          kind === '401'
            ? { status: 'dead', path: '/login' }
            : kind === '403'
              ? {
                  status: step === 'refresh' ? 'blocked' : 'forbidden',
                  path: '/forbidden',
                }
              : { status: 'unavailable', path: '/unavailable' }
        await expect.poll(async () => (await state(receiver))?.status).toBe(expected.status)
        expect((await state(receiver))?.path).toBe(expected.path)
        expect(order.at(-1)).toBe(step)
        expect(counts).toEqual(
          step === 'csrf'
            ? { csrf: 1, refresh: 0, profile: 0 }
            : step === 'refresh'
              ? { csrf: 1, refresh: 1, profile: 0 }
              : { csrf: 1, refresh: 1, profile: 1 },
        )
      })
    }
  }
})

test('real backend restores and closes a normal session', async ({
  context,
  page,
  request,
}) => {
  test.skip(!realSessionEnabled, 'Requiere opt-in y credenciales E2E locales.')
  const preflight = await request.get(new URL('/openapi.json', apiBaseUrl).toString())
  expect(preflight.ok()).toBe(true)
  const email = requiredEnvironment('E2E_MASTER_EMAIL')
  const password = requiredEnvironment('E2E_MASTER_PASSWORD')
  const order: string[] = []
  page.on('request', (browserRequest) => {
    const path = new URL(browserRequest.url()).pathname
    if (path === '/api/auth/csrf') order.push('csrf')
    if (path === '/api/auth/refresh') order.push('refresh')
    if (path === '/api/users/me') order.push('profile')
  })

  await context.clearCookies()
  await page.goto(loginFixture)
  await page.getByRole('textbox', { name: /correo electrónico/i }).fill(email)
  await page.getByLabel(/^contraseña.*obligatorio/i).fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/profile$/u)

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
  expect(order.slice(-3)).toEqual(['csrf', 'refresh', 'profile'])
  const refreshCookie = (await context.cookies()).find(
    ({ name }) => name === 'refresh_token',
  )
  expect(refreshCookie?.httpOnly).toBe(true)
  expect(refreshCookie?.secure).toBe(new URL(apiBaseUrl).protocol === 'https:')
  expect(await page.evaluate(() => document.cookie.includes('refresh_token'))).toBe(false)
  await expectNoStorage(page)

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/u)
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
  expect((await context.cookies()).some(({ name }) => name === 'refresh_token')).toBe(
    false,
  )
  await context.clearCookies()
})

test('representative session states have no critical or serious axe violations', async ({
  page,
}) => {
  await page.goto(`${fixture}?seeded=1&limited=1`)
  await page.addScriptTag({ content: axe.source })
  const results: AxeResults = await page.evaluate(() => window.axe.run())
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
})
