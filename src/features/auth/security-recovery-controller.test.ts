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
import { createSecurityRecoveryController } from './security-recovery-controller'

const API_BASE_URL = 'https://api.example.test/api'

function createHarness(operation: 'refresh' | 'logout') {
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
  if (operation === 'refresh') {
    sessionStore.getState().markRefreshBlocked()
  } else {
    sessionStore.getState().markLogoutBlocked()
  }
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
  const lockCall = vi.fn()
  const sessionLock: SessionLock = {
    run<T>(criticalOperation: 'login' | 'refresh' | 'logout', task: () => Promise<T> | T) {
      lockCall(criticalOperation)
      return Promise.resolve().then(task)
    },
  }
  const retryOriginal = vi
    .fn<
      (originalOperation: 'refresh' | 'logout', csrfToken: string) => Promise<void>
    >()
    .mockResolvedValue(undefined)
  const navigate = vi.fn<
    (destination: '/login' | '/forbidden' | '/unavailable') => void
  >()
  const controller = createSecurityRecoveryController({
    authApi,
    sessionLock,
    sessionStore,
    remoteCache: createRemoteCacheController(queryClient),
    retryOriginal,
    navigate,
  })

  return {
    controller,
    lockCall,
    navigate,
    queryClient,
    retryOriginal,
    sessionStore,
  }
}

describe('security recovery controller', () => {
  it.each(['refresh', 'logout'] as const)(
    'restores CSRF for blocked %s without automatically retrying it',
    async (operation) => {
      let requests = 0
      server.use(
        http.get('https://api.example.test/api/auth/csrf', ({ request }) => {
          requests += 1
          expect(request.credentials).toBe('include')
          expect(request.headers.get('x-requested-with')).toBe('XMLHttpRequest')
          expect(request.headers.has('x-csrf-token')).toBe(false)
          return HttpResponse.json({ csrf_token: 'new-private-csrf-value' })
        }),
      )
      const {
        controller,
        lockCall,
        navigate,
        queryClient,
        retryOriginal,
        sessionStore,
      } = createHarness(operation)
      const identity = sessionStore.getState().identity

      const first = controller.restoreProtection()
      const duplicate = controller.restoreProtection()
      expect(duplicate).toBe(first)
      await expect(first).resolves.toEqual({ kind: 'restored' })

      expect(requests).toBe(1)
      expect(lockCall).toHaveBeenCalledWith(operation)
      expect(retryOriginal).not.toHaveBeenCalled()
      expect(sessionStore.getState()).toMatchObject({
        status: 'blocked',
        operation,
        protection: 'restored',
        accessToken: undefined,
        csrfToken: undefined,
      })
      expect(sessionStore.getState().identity).toBe(identity)
      expect(sessionStore.getState().getAccessToken()).toBeNull()
      expect(sessionStore.getState().getCsrfToken()).toBeNull()
      expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
      expect(navigate).not.toHaveBeenCalled()
      expect(JSON.stringify(controller)).not.toContain('new-private-csrf-value')

      const retryOutcome = await controller.retryOriginal()
      expect(retryOutcome).toEqual({ kind: 'dispatched' })
      expect(retryOriginal).toHaveBeenCalledOnce()
      expect(retryOriginal).toHaveBeenCalledWith(
        operation,
        'new-private-csrf-value',
      )
      expect(JSON.stringify(retryOutcome)).not.toContain('new-private-csrf-value')
    },
  )

  it('ends the session when manual CSRF recovery returns 401', async () => {
    server.use(
      http.get('https://api.example.test/api/auth/csrf', () =>
        HttpResponse.json({ detail: 'session ended' }, { status: 401 }),
      ),
    )
    const { controller, navigate, queryClient, sessionStore } =
      createHarness('refresh')

    await expect(controller.restoreProtection()).resolves.toEqual({ kind: 'dead' })

    expect(sessionStore.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it.each(['Primer detalle privado', 'Otro detalle privado'])(
    'keeps generic blocked state for repeated 403: %s',
    async (detail) => {
      server.use(
        http.get('https://api.example.test/api/auth/csrf', () =>
          HttpResponse.json({ detail }, { status: 403 }),
        ),
      )
      const { controller, navigate, queryClient, sessionStore } =
        createHarness('logout')
      const identity = sessionStore.getState().identity

      const outcome = await controller.restoreProtection()

      expect(outcome).toEqual({ kind: 'blocked' })
      expect(JSON.stringify(outcome)).not.toContain(detail)
      expect(sessionStore.getState()).toMatchObject({
        status: 'blocked',
        operation: 'logout',
        protection: 'required',
      })
      expect(sessionStore.getState().identity).toBe(identity)
      expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
      expect(navigate).toHaveBeenCalledWith('/forbidden')
    },
  )

  it.each(['network', '503'] as const)(
    'quarantines context as unavailable after %s with no automatic retry',
    async (failure) => {
      let requests = 0
      server.use(
        http.get('https://api.example.test/api/auth/csrf', () => {
          requests += 1
          return failure === 'network'
            ? HttpResponse.error()
            : HttpResponse.json({ detail: 'private unavailable' }, { status: 503 })
        }),
      )
      const { controller, navigate, queryClient, sessionStore } =
        createHarness('refresh')
      const identity = sessionStore.getState().identity

      await expect(controller.restoreProtection()).resolves.toEqual({
        kind: 'unavailable',
      })

      expect(requests).toBe(1)
      expect(sessionStore.getState()).toMatchObject({
        status: 'unavailable',
        context: 'security-recovery',
        operation: 'refresh',
        accessToken: undefined,
        csrfToken: undefined,
      })
      expect(sessionStore.getState().identity).toBe(identity)
      expect(sessionStore.getState().getAccessToken()).toBeNull()
      expect(sessionStore.getState().getCsrfToken()).toBeNull()
      expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
      expect(navigate).toHaveBeenCalledWith('/unavailable')
    },
  )

  it('allows one explicit CSRF retry after unavailable without starting the original operation', async () => {
    let requests = 0
    server.use(
      http.get('https://api.example.test/api/auth/csrf', () => {
        requests += 1
        return requests === 1
          ? HttpResponse.json({ detail: 'offline' }, { status: 503 })
          : HttpResponse.json({ csrf_token: 'retried-private-csrf' })
      }),
    )
    const { controller, retryOriginal, sessionStore } = createHarness('logout')

    await expect(controller.restoreProtection()).resolves.toEqual({
      kind: 'unavailable',
    })
    expect(requests).toBe(1)
    expect(retryOriginal).not.toHaveBeenCalled()

    await expect(controller.restoreProtection()).resolves.toEqual({ kind: 'restored' })
    expect(requests).toBe(2)
    expect(sessionStore.getState()).toMatchObject({
      status: 'blocked',
      operation: 'logout',
      protection: 'restored',
    })
    expect(retryOriginal).not.toHaveBeenCalled()
  })
})
