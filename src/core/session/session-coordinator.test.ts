import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { createRemoteCacheController } from '../../app/query-client'
import { userResponseSchema } from '../../contracts/schemas/user'
import { createTestQueryClient } from '../../test/create-test-query-client'
import { server } from '../../test/server'
import {
  directCriticalOperations,
  silentSessionSignals,
} from '../../test/session-test-ports'
import { createApiClient } from '../http/api-client'
import { createAuthClient } from '../http/auth-client'
import { createAuthApi, type AuthApi } from './auth-api'
import { createInitialSessionCoordinator } from './session-coordinator'
import { createSessionStore } from './session-store'

const API_BASE_URL = 'https://api.example.test/api'
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const TOKEN_RESPONSE = {
  access_token: 'restored-access-value',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'rotated-csrf-value',
}
const USER_RESPONSE = {
  uuid: USER_UUID,
  name: 'Ana',
  last_name: 'Pérez',
  email: 'ana@example.com',
  phone_number: '3001234567',
  role: 'master',
  is_active: true,
} as const

function createRestorationHarness() {
  const sessionStore = createSessionStore({
    now: () => new Date('2026-10-08T12:00:00.000Z'),
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
  const navigate = vi.fn<
    (destination: '/login' | '/forbidden' | '/unavailable') => void
  >()
  const criticalOperation = vi.fn()
  const coordinator = createInitialSessionCoordinator({
    authApi,
    profileApi: apiClient,
    sessionStore,
    remoteCache: createRemoteCacheController(queryClient),
    navigate,
    criticalOperations: {
      run(operation, task) {
        criticalOperation(operation)
        return Promise.resolve().then(task)
      },
    },
  })

  return { coordinator, criticalOperation, navigate, queryClient, sessionStore }
}

function authenticateStore(sessionStore: ReturnType<typeof createSessionStore>) {
  sessionStore.getState().acceptTokens({
    accessToken: 'expired-access-value',
    tokenType: 'bearer',
    expiresIn: 30,
    csrfToken: 'current-csrf-value',
  })
  sessionStore.getState().acceptIdentity({
    userUuid: USER_UUID,
    name: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.com',
    phoneNumber: '3001234567',
    role: 'master',
    isActive: true,
  })
}

function createReadRecoveryHarness(
  refreshOverride?: AuthApi['refresh'],
) {
  const sessionStore = createSessionStore({
    now: () => new Date('2026-10-08T12:00:00.000Z'),
  })
  authenticateStore(sessionStore)
  const authClient = createAuthClient({
    apiBaseUrl: API_BASE_URL,
    getCsrfToken: () => sessionStore.getState().getCsrfToken(),
  })
  const bootstrapApiClient = createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => sessionStore.getState().getAccessToken(),
    sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
  })
  const authApi = createAuthApi({
    authClient,
    apiClient: bootstrapApiClient,
    sessionStore,
    criticalOperations: directCriticalOperations,
    sessionSignals: silentSessionSignals,
  })
  const queryClient = createTestQueryClient()
  const navigate = vi.fn<
    (destination: '/login' | '/unavailable' | '/forbidden') => void
  >()
  const criticalOperation = vi.fn()
  const coordinator = createInitialSessionCoordinator({
    authApi:
      refreshOverride === undefined
        ? authApi
        : { getCsrf: authApi.getCsrf, refresh: refreshOverride },
    profileApi: bootstrapApiClient,
    sessionStore,
    remoteCache: createRemoteCacheController(queryClient),
    navigate,
    criticalOperations: {
      run(operation, task) {
        criticalOperation(operation)
        return Promise.resolve().then(task)
      },
    },
  })
  const apiClient = createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => sessionStore.getState().getAccessToken(),
    sessionRecovery: coordinator,
  })

  return {
    apiClient,
    coordinator,
    criticalOperation,
    navigate,
    queryClient,
    sessionStore,
  }
}

function successHandlers(order: string[]) {
  return [
    http.get('https://api.example.test/api/auth/csrf', () => {
      order.push('csrf')
      return HttpResponse.json({ csrf_token: 'restoration-csrf-value' })
    }),
    http.post('https://api.example.test/api/auth/refresh', ({ request }) => {
      order.push('refresh')
      expect(request.headers.get('x-csrf-token')).toBe('restoration-csrf-value')
      return HttpResponse.json(TOKEN_RESPONSE)
    }),
    http.get('https://api.example.test/api/users/me', ({ request }) => {
      order.push('profile')
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${TOKEN_RESPONSE.access_token}`,
      )
      return HttpResponse.json(USER_RESPONSE)
    }),
  ]
}

describe('initial session coordinator', () => {
  it('restores exactly in CSRF, refresh and profile order without decoding tokens', async () => {
    const order: string[] = []
    server.use(...successHandlers(order))
    const { coordinator, criticalOperation, navigate, sessionStore } =
      createRestorationHarness()

    await expect(coordinator.restoreInitial()).resolves.toBe('authenticated')

    expect(order).toEqual(['csrf', 'refresh', 'profile'])
    expect(criticalOperation).toHaveBeenCalledWith('refresh')
    expect(navigate).not.toHaveBeenCalled()
    expect(sessionStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: TOKEN_RESPONSE.access_token,
      csrfToken: TOKEN_RESPONSE.csrf_token,
      accessExpiresAt: new Date('2026-10-08T12:02:00.000Z'),
      identity: {
        userUuid: USER_UUID,
        role: 'master',
      },
    })
  })

  it.each(['csrf', 'refresh', 'profile'] as const)(
    'ends the session, clears remote cache and stops after a 401 in %s',
    async (failedStep) => {
      const order: string[] = []
      const handlers = successHandlers(order)
      const index = { csrf: 0, refresh: 1, profile: 2 }[failedStep]
      const path = {
        csrf: '/api/auth/csrf',
        refresh: '/api/auth/refresh',
        profile: '/api/users/me',
      }[failedStep]
      const method = failedStep === 'csrf' || failedStep === 'profile' ? 'get' : 'post'
      handlers[index] = http[method](`https://api.example.test${path}`, () => {
        order.push(failedStep)
        return HttpResponse.json({ detail: 'private unauthorized detail' }, { status: 401 })
      })
      server.use(...handlers)
      const { coordinator, navigate, queryClient, sessionStore } =
        createRestorationHarness()
      queryClient.setQueryData(['private', 'profile'], { name: 'must clear' })

      await expect(coordinator.restoreInitial()).resolves.toBe('dead')

      expect(order).toEqual(
        ['csrf', 'refresh', 'profile'].slice(0, index + 1),
      )
      expect(sessionStore.getState()).toMatchObject({
        status: 'dead',
        accessToken: undefined,
        csrfToken: undefined,
        identity: undefined,
      })
      expect(queryClient.getQueryCache().getAll()).toEqual([])
      expect(navigate).toHaveBeenCalledOnce()
      expect(navigate).toHaveBeenCalledWith('/login')
    },
  )

  it.each([
    ['csrf', 'network'],
    ['refresh', 'network'],
    ['profile', 'network'],
    ['csrf', '503'],
    ['refresh', '503'],
    ['profile', '503'],
  ] as const)(
    'keeps private content unavailable and stops after %s %s until manual retry',
    async (failedStep, failure) => {
      const order: string[] = []
      const handlers = successHandlers(order)
      const index = { csrf: 0, refresh: 1, profile: 2 }[failedStep]
      const path = {
        csrf: '/api/auth/csrf',
        refresh: '/api/auth/refresh',
        profile: '/api/users/me',
      }[failedStep]
      const method = failedStep === 'csrf' || failedStep === 'profile' ? 'get' : 'post'
      handlers[index] = http[method](`https://api.example.test${path}`, () => {
        order.push(failedStep)
        return failure === 'network'
          ? HttpResponse.error()
          : HttpResponse.json({ detail: 'temporarily unavailable' }, { status: 503 })
      })
      server.use(...handlers)
      const { coordinator, navigate, queryClient, sessionStore } =
        createRestorationHarness()
      queryClient.setQueryData(['public', 'bootstrap'], { keep: true })

      await expect(coordinator.restoreInitial()).resolves.toBe('unavailable')

      expect(order).toEqual(
        ['csrf', 'refresh', 'profile'].slice(0, index + 1),
      )
      expect(sessionStore.getState()).toMatchObject({
        status: 'unavailable',
        context: 'initial-restoration',
        accessToken: undefined,
        csrfToken: undefined,
        identity: undefined,
      })
      expect(queryClient.getQueryData(['public', 'bootstrap'])).toEqual({ keep: true })
      expect(navigate).toHaveBeenCalledOnce()
      expect(navigate).toHaveBeenCalledWith('/unavailable')
    },
  )

  it('does not retry automatically and starts one complete sequence on manual retry', async () => {
    const order: string[] = []
    let csrfRequests = 0
    server.use(
      http.get('https://api.example.test/api/auth/csrf', () => {
        order.push('csrf')
        csrfRequests += 1
        return csrfRequests === 1
          ? HttpResponse.json({ detail: 'offline' }, { status: 503 })
          : HttpResponse.json({ csrf_token: 'restoration-csrf-value' })
      }),
      ...successHandlers(order).slice(1),
    )
    const { coordinator, sessionStore } = createRestorationHarness()

    await expect(coordinator.restoreInitial()).resolves.toBe('unavailable')
    expect(order).toEqual(['csrf'])

    const firstRetry = coordinator.retryInitial()
    const duplicateActivation = coordinator.retryInitial()
    expect(duplicateActivation).toBe(firstRetry)
    await expect(firstRetry).resolves.toBe('authenticated')

    expect(order).toEqual(['csrf', 'csrf', 'refresh', 'profile'])
    expect(sessionStore.getState().status).toBe('authenticated')
  })

  it('fails closed on an invalid profile without retaining partial credentials', async () => {
    const order: string[] = []
    const handlers = successHandlers(order)
    handlers[2] = http.get('https://api.example.test/api/users/me', () => {
      order.push('profile')
      return HttpResponse.json({ ...USER_RESPONSE, document_number: 'must-not-be-public' })
    })
    server.use(...handlers)
    const { coordinator, navigate, sessionStore } = createRestorationHarness()

    await expect(coordinator.restoreInitial()).resolves.toBe('technical')

    expect(order).toEqual(['csrf', 'refresh', 'profile'])
    expect(sessionStore.getState()).toMatchObject({
      status: 'unavailable',
      context: 'initial-restoration',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(navigate).toHaveBeenCalledWith('/unavailable')
  })

  it('cancels a pending restoration without running later steps or navigation', async () => {
    let resolveCsrf: ((value: { kind: 'success'; csrfToken: string }) => void) | undefined
    const getCsrf = vi.fn(
      () =>
        new Promise<{ kind: 'success'; csrfToken: string }>((resolve) => {
          resolveCsrf = resolve
        }),
    )
    const refresh = vi.fn(() =>
      Promise.resolve({ kind: 'technical', status: undefined } as const),
    )
    const profileRead = vi.fn()
    const sessionStore = createSessionStore()
    const navigate = vi.fn<
      (destination: '/login' | '/forbidden' | '/unavailable') => void
    >()
    const coordinator = createInitialSessionCoordinator({
      authApi: { getCsrf, refresh },
      profileApi: { read: profileRead },
      sessionStore,
      remoteCache: { clearForSessionEnd: vi.fn() },
      navigate,
      criticalOperations: directCriticalOperations,
    })

    const pending = coordinator.restoreInitial()
    coordinator.cancelInitial()
    resolveCsrf?.({ kind: 'success', csrfToken: 'late-csrf-value' })

    await expect(pending).resolves.toBe('technical')
    expect(refresh).not.toHaveBeenCalled()
    expect(profileRead).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(sessionStore.getState()).toMatchObject({
      status: 'unknown',
      phase: 'restoring',
      csrfToken: undefined,
      accessToken: undefined,
      identity: undefined,
    })
  })
})

describe('authenticated read recovery', () => {
  it('shares one refresh promise, preserves identity and releases it after settlement', async () => {
    let refreshRequests = 0
    server.use(
      http.post('https://api.example.test/api/auth/refresh', ({ request }) => {
        refreshRequests += 1
        expect(request.headers.get('x-csrf-token')).toBe(
          refreshRequests === 1 ? 'current-csrf-value' : 'rotated-csrf-value',
        )
        return HttpResponse.json({
          ...TOKEN_RESPONSE,
          access_token: `renewed-access-${refreshRequests.toString()}`,
        })
      }),
    )
    const { coordinator, criticalOperation, navigate, queryClient, sessionStore } =
      createReadRecoveryHarness()
    queryClient.setQueryData(['private', 'profile'], { name: 'Ana' })
    const identity = sessionStore.getState().identity

    const first = coordinator.recoverRead()
    const second = coordinator.recoverRead()

    expect(second).toBe(first)
    await expect(Promise.all([first, second])).resolves.toEqual([
      'recovered',
      'recovered',
    ])
    expect(refreshRequests).toBe(1)
    expect(criticalOperation).toHaveBeenCalledWith('refresh')
    expect(sessionStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'renewed-access-1',
      csrfToken: 'rotated-csrf-value',
      accessExpiresAt: new Date('2026-10-08T12:02:00.000Z'),
    })
    expect(sessionStore.getState().identity).toBe(identity)
    expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
    expect(navigate).not.toHaveBeenCalled()

    await expect(coordinator.recoverRead()).resolves.toBe('recovered')
    expect(refreshRequests).toBe(2)
  })

  it('integrates with concurrent real reads using one refresh and one replay per read', async () => {
    let refreshRequests = 0
    let protectedRequests = 0
    server.use(
      http.post('https://api.example.test/api/auth/refresh', () => {
        refreshRequests += 1
        return HttpResponse.json(TOKEN_RESPONSE)
      }),
      http.get('https://api.example.test/api/users/me', ({ request }) => {
        protectedRequests += 1
        const authorization = request.headers.get('authorization')
        return authorization === 'Bearer expired-access-value'
          ? HttpResponse.json({ detail: 'expired' }, { status: 401 })
          : HttpResponse.json(USER_RESPONSE)
      }),
    )
    const { apiClient, sessionStore } = createReadRecoveryHarness()

    const outcomes = await Promise.all([
      apiClient.read({ target: '/users/me', schema: userResponseSchema }),
      apiClient.read({ target: '/users/me', schema: userResponseSchema }),
    ])

    expect(outcomes).toEqual([
      { kind: 'success', data: USER_RESPONSE },
      { kind: 'success', data: USER_RESPONSE },
    ])
    expect(refreshRequests).toBe(1)
    expect(protectedRequests).toBe(4)
    expect(sessionStore.getState().accessToken).toBe(TOKEN_RESPONSE.access_token)
  })

  it('never starts another refresh when the single replay also returns 401', async () => {
    let refreshRequests = 0
    let protectedRequests = 0
    server.use(
      http.post('https://api.example.test/api/auth/refresh', () => {
        refreshRequests += 1
        return HttpResponse.json(TOKEN_RESPONSE)
      }),
      http.get('https://api.example.test/api/users/me', () => {
        protectedRequests += 1
        return HttpResponse.json({ detail: 'still unauthorized' }, { status: 401 })
      }),
    )
    const { apiClient } = createReadRecoveryHarness()

    await expect(
      apiClient.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toEqual({ kind: 'session', state: 'dead' })
    expect(protectedRequests).toBe(2)
    expect(refreshRequests).toBe(1)
  })

  it('ends the session and skips replay when refresh returns 401', async () => {
    let refreshRequests = 0
    let protectedRequests = 0
    server.use(
      http.post('https://api.example.test/api/auth/refresh', () => {
        refreshRequests += 1
        return HttpResponse.json({ detail: 'dead session' }, { status: 401 })
      }),
      http.get('https://api.example.test/api/users/me', () => {
        protectedRequests += 1
        return HttpResponse.json({ detail: 'expired access' }, { status: 401 })
      }),
    )
    const { apiClient, navigate, queryClient, sessionStore } =
      createReadRecoveryHarness()
    queryClient.setQueryData(['private', 'profile'], { name: 'must clear' })

    await expect(
      apiClient.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toEqual({ kind: 'session', state: 'dead' })

    expect(refreshRequests).toBe(1)
    expect(protectedRequests).toBe(1)
    expect(sessionStore.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it.each(['network', '500', '503'] as const)(
    'makes the session unavailable without clearing quarantined context after %s',
    async (failure) => {
      let refreshRequests = 0
      server.use(
        http.post('https://api.example.test/api/auth/refresh', () => {
          refreshRequests += 1
          if (failure === 'network') return HttpResponse.error()
          return HttpResponse.json(
            { detail: 'private server diagnostic' },
            { status: Number(failure) },
          )
        }),
      )
      const { coordinator, navigate, queryClient, sessionStore } =
        createReadRecoveryHarness()
      queryClient.setQueryData(['private', 'profile'], { name: 'Ana' })
      const identity = sessionStore.getState().identity

      await expect(coordinator.recoverRead()).resolves.toBe('unavailable')

      expect(refreshRequests).toBe(1)
      expect(sessionStore.getState()).toMatchObject({
        status: 'unavailable',
        context: 'security-recovery',
        operation: 'refresh',
        accessToken: undefined,
        csrfToken: undefined,
      })
      expect(sessionStore.getState().identity).toBe(identity)
      expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
      expect(navigate).toHaveBeenCalledWith('/unavailable')
    },
  )

  it.each(['Primer detalle privado', 'Otro detalle privado'])(
    'blocks refresh 403 without comparing its message: %s',
    async (detail) => {
      server.use(
        http.post('https://api.example.test/api/auth/refresh', () =>
          HttpResponse.json({ detail }, { status: 403 }),
        ),
      )
      const { coordinator, navigate, queryClient, sessionStore } =
        createReadRecoveryHarness()
      queryClient.setQueryData(['private', 'profile'], { name: 'Ana' })
      const identity = sessionStore.getState().identity

      const outcome = await coordinator.recoverRead()

      expect(outcome).toBe('blocked')
      expect(JSON.stringify(outcome)).not.toContain(detail)
      expect(sessionStore.getState()).toMatchObject({
        status: 'blocked',
        operation: 'refresh',
        accessToken: undefined,
        csrfToken: undefined,
      })
      expect(sessionStore.getState().identity).toBe(identity)
      expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })
      expect(navigate).toHaveBeenCalledWith('/forbidden')
    },
  )

  it('gives every waiter one sanitized unavailable result after an unexpected throw', async () => {
    const privateDiagnostic = 'private unexpected diagnostic'
    const refresh = vi.fn<AuthApi['refresh']>(() =>
      Promise.reject(new Error(privateDiagnostic)),
    )
    const { coordinator, queryClient, sessionStore } =
      createReadRecoveryHarness(refresh)
    queryClient.setQueryData(['private', 'profile'], { name: 'Ana' })

    const first = coordinator.recoverRead()
    const second = coordinator.recoverRead()

    expect(second).toBe(first)
    const outcomes = await Promise.all([first, second])
    expect(outcomes).toEqual(['unavailable', 'unavailable'])
    expect(JSON.stringify(outcomes)).not.toContain(privateDiagnostic)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sessionStore.getState()).toMatchObject({
      status: 'unavailable',
      context: 'security-recovery',
      accessToken: undefined,
      csrfToken: undefined,
    })
    expect(queryClient.getQueryData(['private', 'profile'])).toEqual({ name: 'Ana' })

    await expect(coordinator.recoverRead()).resolves.toBe('unavailable')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
