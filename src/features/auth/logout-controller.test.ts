import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { createRemoteCacheController } from '../../app/query-client'
import { createTestQueryClient } from '../../test/create-test-query-client'
import { server } from '../../test/server'
import {
  directCriticalOperations,
  silentSessionSignals,
} from '../../test/session-test-ports'
import { createApiClient } from '../../core/http/api-client'
import { createAuthClient } from '../../core/http/auth-client'
import { createAuthApi } from '../../core/session/auth-api'
import type { SessionLock } from '../../core/session/session-lock'
import { createSessionStore } from '../../core/session/session-store'
import { createLogoutController } from './logout-controller'

const API_BASE_URL = 'https://api.example.test/api'

function createHarness() {
  const sessionStore = createSessionStore()
  sessionStore.getState().acceptTokens({
    accessToken: 'private-access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'private-csrf-value',
  })
  sessionStore.getState().acceptIdentity({
    userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role: 'master',
    isActive: true,
  })
  const authClient = createAuthClient({
    apiBaseUrl: API_BASE_URL,
    getCsrfToken: () => sessionStore.getState().getCsrfToken(),
  })
  const apiClient = createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => sessionStore.getState().getAccessToken(),
    sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
  })
  const authApi = createAuthApi({
    authClient,
    apiClient,
    sessionStore,
    criticalOperations: directCriticalOperations,
    sessionSignals: silentSessionSignals,
  })
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(['private', 'profile'], { name: 'Ana' })
  const run = vi.fn()
  const sessionLock: SessionLock = {
    run<T>(operation: 'login' | 'refresh' | 'logout', task: () => Promise<T> | T) {
      run(operation)
      return Promise.resolve().then(task)
    },
  }
  const publish = vi.fn()
  const navigate = vi.fn<(destination: '/login' | '/forbidden') => void>()
  const controller = createLogoutController({
    authApi,
    sessionLock,
    sessionStore,
    remoteCache: createRemoteCacheController(queryClient),
    sessionSignals: { publish },
    navigate,
  })

  return {
    controller,
    navigate,
    publish,
    queryClient,
    run,
    sessionStore,
  }
}

describe('logout controller', () => {
  it('runs one locked request and commits local logout only after backend success', async () => {
    let requests = 0
    server.use(
      http.post('https://api.example.test/api/auth/logout', ({ request }) => {
        requests += 1
        expect(request.credentials).toBe('include')
        expect(request.headers.get('x-requested-with')).toBe('XMLHttpRequest')
        expect(request.headers.get('x-csrf-token')).toBe('private-csrf-value')
        return HttpResponse.json({ detail: 'Sesión finalizada' })
      }),
    )
    const { controller, navigate, publish, queryClient, run, sessionStore } =
      createHarness()

    const first = controller.logout()
    const duplicate = controller.logout()
    expect(duplicate).toBe(first)
    await expect(first).resolves.toEqual({ kind: 'logged-out' })

    expect(requests).toBe(1)
    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith('logout')
    expect(sessionStore.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(publish).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith('logged-out')
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it.each(['network', '503'] as const)(
    'preserves authenticated state and cache after %s without automatic retry',
    async (failure) => {
      let requests = 0
      server.use(
        http.post('https://api.example.test/api/auth/logout', () => {
          requests += 1
          return failure === 'network'
            ? HttpResponse.error()
            : HttpResponse.json({ detail: 'private unavailable detail' }, { status: 503 })
        }),
      )
      const { controller, navigate, publish, queryClient, sessionStore } =
        createHarness()
      const stateBefore = sessionStore.getState()

      const outcome = await controller.logout()

      expect(outcome).toEqual({ kind: 'unavailable' })
      expect(requests).toBe(1)
      expect(sessionStore.getState()).toBe(stateBefore)
      expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
      expect(publish).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
      expect(JSON.stringify(outcome)).not.toMatch(/private|csrf|axios|request|response/i)
    },
  )

  it('retries only after an explicit second invocation', async () => {
    let requests = 0
    server.use(
      http.post('https://api.example.test/api/auth/logout', () => {
        requests += 1
        return requests === 1
          ? HttpResponse.json({ detail: 'offline' }, { status: 503 })
          : HttpResponse.json({ detail: 'Sesión finalizada' })
      }),
    )
    const { controller } = createHarness()

    await expect(controller.logout()).resolves.toEqual({ kind: 'unavailable' })
    expect(requests).toBe(1)

    await expect(controller.logout()).resolves.toEqual({ kind: 'logged-out' })
    expect(requests).toBe(2)
  })

  it.each(['Primer detalle privado', 'Otro detalle privado'])(
    'quarantines logout 403 without comparing its message: %s',
    async (detail) => {
      server.use(
        http.post('https://api.example.test/api/auth/logout', () =>
          HttpResponse.json({ detail }, { status: 403 }),
        ),
      )
      const { controller, navigate, publish, queryClient, sessionStore } =
        createHarness()
      const identity = sessionStore.getState().identity

      const outcome = await controller.logout()

      expect(outcome).toEqual({ kind: 'blocked' })
      expect(JSON.stringify(outcome)).not.toContain(detail)
      expect(sessionStore.getState()).toMatchObject({
        status: 'blocked',
        operation: 'logout',
        accessToken: undefined,
        csrfToken: undefined,
      })
      expect(sessionStore.getState().identity).toBe(identity)
      expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
      expect(publish).not.toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith('/forbidden')
    },
  )

  it('treats logout 401 as an already-ended session without publishing success', async () => {
    server.use(
      http.post('https://api.example.test/api/auth/logout', () =>
        HttpResponse.json({ detail: 'already ended' }, { status: 401 }),
      ),
    )
    const { controller, navigate, publish, queryClient, sessionStore } =
      createHarness()

    await expect(controller.logout()).resolves.toEqual({
      kind: 'local-session-ended',
    })

    expect(sessionStore.getState().status).toBe('dead')
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(publish).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/login')
  })
})
