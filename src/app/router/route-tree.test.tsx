import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { createSessionStore } from '../../core/session/session-store'
import { createAppRouter } from './router'
import type { AppRouterContext } from './router-context'

const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const EXPECTED_FULL_PATHS = Object.freeze([
  '/login',
  '/profile',
  '/users',
  '/users/new',
  '/users/$userUuid',
  '/users/$userUuid/edit',
  '/forbidden',
  '/unavailable',
] as const)

function createContext(): AppRouterContext {
  const store = createSessionStore()
  store.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  store.getState().completeSession({
    userUuid: USER_UUID,
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role: 'superadmin',
    isActive: true,
  })
  return {
    queryClient: new QueryClient(),
    session: {
      store,
      login: () => Promise.resolve({ kind: 'technical' }),
      logoutController: { logout: () => Promise.resolve({ kind: 'logged-out' }) },
      createSecurityRecoveryController: () => ({
        operation: 'refresh',
        restoreProtection: () => Promise.resolve({ kind: 'restored' }),
        retryOriginal: () => Promise.resolve({ kind: 'dispatched' }),
      }),
      coordinator: {
        restoreInitial: () => Promise.resolve('dead'),
        retryInitial: () => Promise.resolve('dead'),
        cancelInitial: () => undefined,
      },
    },
  }
}

function createTestRouter(initialEntry = '/login') {
  return createAppRouter({
    context: createContext(),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
}

describe('application route tree', () => {
  it('declares exactly the eight normative full paths', () => {
    const router = createTestRouter()
    const fullPaths = Object.values(router.routesById)
      .filter((route) => route.id !== '__root__')
      .map((route) => route.fullPath)
      .sort()

    expect(fullPaths).toEqual([...EXPECTED_FULL_PATHS].sort())
    expect(fullPaths).not.toContain('/')
    expect(fullPaths).not.toContain('/dashboard')
    expect(fullPaths).not.toContain('/register')
    expect(fullPaths).not.toContain('/recovery')
    expect(fullPaths.some((path) => path.includes('$'))).toBe(true)
    expect(fullPaths.some((path) => path.includes('*'))).toBe(false)
  })

  it('keeps user creation/detail nested under users and edit under detail', () => {
    const router = createTestRouter()

    expect(router.routesById['/users/new'].parentRoute.fullPath).toBe('/users')
    expect(router.routesById['/users/$userUuid'].parentRoute.fullPath).toBe(
      '/users',
    )
    expect(router.routesById['/users/$userUuid/edit'].parentRoute.fullPath).toBe(
      '/users/$userUuid',
    )
    for (const routeId of [
      '/login',
      '/profile',
      '/users',
      '/forbidden',
      '/unavailable',
    ] as const) {
      expect(router.routesById[routeId].parentRoute.id).toBe('__root__')
    }
  })

  it('provides typed injected context without mounting a React router', () => {
    const context = createContext()
    const router = createAppRouter({
      context,
      history: createMemoryHistory({ initialEntries: ['/profile'] }),
    })

    expect(router.options.context).toBe(context)
    expect(router.options.context.session.store).toBe(context.session.store)
    expectTypeOf(router.options.context).toEqualTypeOf<AppRouterContext>()
  })
})

describe('$userUuid route parameter', () => {
  it.each([
    [`/users/${USER_UUID}`, '/users/$userUuid'],
    [`/users/${USER_UUID}/edit`, '/users/$userUuid/edit'],
  ] as const)('validates and types the parameter before loading %s', async (path, routeId) => {
    const router = createTestRouter(path)

    await router.load()

    const match = router.state.matches.find((candidate) => candidate.routeId === routeId)
    expect(match?.status).toBe('success')
    expect(match?.params).toEqual({ userUuid: USER_UUID })
    expectTypeOf<
      (typeof router.routesById)['/users/$userUuid']['types']['allParams']
    >().toEqualTypeOf<{ userUuid: string }>()
  })

  it('normalizes a valid UUID before exposing route params', async () => {
    const router = createTestRouter(`/users/${USER_UUID.toUpperCase()}`)

    await router.load()

    const detailMatch = router.state.matches.find(
      (candidate) => candidate.routeId === '/users/$userUuid',
    )
    expect(detailMatch?.status).toBe('success')
    expect(detailMatch?.params).toEqual({ userUuid: USER_UUID })
  })

  it.each(['not-a-uuid', '123', '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c7z'])(
    'rejects invalid UUID %s before the detail page succeeds',
    async (invalidUuid) => {
      const router = createTestRouter(`/users/${invalidUuid}`)

      await router.load()

      expect(router.state.location.pathname).toBe('/forbidden')
      expect(
        router.state.matches.some(
          (candidate) => candidate.routeId === '/users/$userUuid',
        ),
      ).toBe(false)
    },
  )
})
