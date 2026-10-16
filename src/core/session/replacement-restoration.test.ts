import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { createRemoteCacheController } from '../../app/query-client'
import { createTestQueryClient } from '../../test/create-test-query-client'
import { server } from '../../test/server'
import {
  directCriticalOperations,
  silentSessionSignals,
} from '../../test/session-test-ports'
import { createApiClient } from '../http/api-client'
import { createAuthClient } from '../http/auth-client'
import { createAuthApi } from './auth-api'
import { createInitialSessionCoordinator } from './session-coordinator'
import { createSessionStore, type SessionIdentity } from './session-store'

const API_BASE_URL = 'https://api.example.test/api'
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const PREVIOUS_IDENTITY: SessionIdentity = {
  userUuid: USER_UUID,
  name: 'Ana',
  lastName: null,
  email: 'ana@example.com',
  phoneNumber: null,
  role: 'superadmin',
  isActive: true,
}
const TOKENS = {
  access_token: 'restored-access-value',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'rotated-csrf-value',
}
const PROFILE = {
  uuid: USER_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  role: 'superadmin',
  is_active: true,
} as const

type RestorationStep = 'csrf' | 'refresh' | 'profile'
type Failure = '401' | '403' | 'network' | '503'

function createHarness() {
  const sessionStore = createSessionStore({
    now: () => new Date('2026-10-08T12:00:00.000Z'),
  })
  sessionStore.getState().acceptTokens({
    accessToken: 'old-access',
    tokenType: 'bearer',
    expiresIn: 30,
    csrfToken: 'old-csrf',
  })
  sessionStore.getState().acceptIdentity(PREVIOUS_IDENTITY)
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
  queryClient.setQueryData(['private', 'old-account'], { secret: 'cached' })
  const cache = createRemoteCacheController(queryClient)
  const navigate = vi.fn<
    (destination: '/login' | '/forbidden' | '/unavailable') => void
  >()
  const criticalOperation = vi.fn()
  const coordinator = createInitialSessionCoordinator({
    authApi,
    profileApi: apiClient,
    sessionStore,
    remoteCache: cache,
    navigate,
    criticalOperations: {
      run(operation, task) {
        criticalOperation(operation)
        return Promise.resolve().then(task)
      },
    },
  })

  return {
    cache,
    coordinator,
    criticalOperation,
    navigate,
    queryClient,
    sessionStore,
  }
}

function responseFor(failure: Failure) {
  if (failure === 'network') return HttpResponse.error()
  return HttpResponse.json(
    { detail: `private-${failure}-diagnostic` },
    { status: Number(failure) },
  )
}

function handlers(
  order: RestorationStep[],
  failedStep?: RestorationStep,
  failure?: Failure,
) {
  return [
    http.get('https://api.example.test/api/auth/csrf', () => {
      order.push('csrf')
      return failedStep === 'csrf' && failure !== undefined
        ? responseFor(failure)
        : HttpResponse.json({ csrf_token: 'restoration-csrf-value' })
    }),
    http.post('https://api.example.test/api/auth/refresh', () => {
      order.push('refresh')
      return failedStep === 'refresh' && failure !== undefined
        ? responseFor(failure)
        : HttpResponse.json(TOKENS)
    }),
    http.get('https://api.example.test/api/users/me', () => {
      order.push('profile')
      return failedStep === 'profile' && failure !== undefined
        ? responseFor(failure)
        : HttpResponse.json(PROFILE)
    }),
  ]
}

describe('same-account replacement restoration', () => {
  it('completes the three steps once after old cache is discarded', async () => {
    const order: RestorationStep[] = []
    server.use(...handlers(order))
    const {
      cache,
      coordinator,
      criticalOperation,
      navigate,
      queryClient,
      sessionStore,
    } =
      createHarness()
    cache.clearForAccountChange()

    await expect(
      coordinator.restoreReplacement(PREVIOUS_IDENTITY),
    ).resolves.toBe('authenticated')

    expect(order).toEqual(['csrf', 'refresh', 'profile'])
    expect(criticalOperation).toHaveBeenCalledWith('refresh')
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(sessionStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: TOKENS.access_token,
      csrfToken: TOKENS.csrf_token,
      identity: { userUuid: USER_UUID, role: 'superadmin' },
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each(['csrf', 'refresh', 'profile'] as const)(
    'stops after %s 401, clears everything and navigates to login',
    async (step) => {
      const order: RestorationStep[] = []
      server.use(...handlers(order, step, '401'))
      const { cache, coordinator, navigate, queryClient, sessionStore } =
        createHarness()
      cache.clearForAccountChange()

      await expect(
        coordinator.restoreReplacement(PREVIOUS_IDENTITY),
      ).resolves.toBe('dead')

      expect(order).toEqual(
        ['csrf', 'refresh', 'profile'].slice(0, order.length),
      )
      expect(order.at(-1)).toBe(step)
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
    ['csrf', 'forbidden'],
    ['refresh', 'blocked'],
    ['profile', 'forbidden'],
  ] as const)('distinguishes %s 403 as %s', async (step, expectedState) => {
    const order: RestorationStep[] = []
    server.use(...handlers(order, step, '403'))
    const { cache, coordinator, navigate, queryClient, sessionStore } =
      createHarness()
    cache.clearForAccountChange()

    await expect(
      coordinator.restoreReplacement(PREVIOUS_IDENTITY),
    ).resolves.toBe(expectedState)

    expect(order.at(-1)).toBe(step)
    expect(sessionStore.getState()).toMatchObject({
      status: expectedState,
      accessToken: undefined,
      csrfToken: undefined,
    })
    expect(sessionStore.getState().identity).toBe(
      expectedState === 'blocked' ? PREVIOUS_IDENTITY : undefined,
    )
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/forbidden')
  })

  it.each([
    ['csrf', 'network'],
    ['refresh', 'network'],
    ['profile', 'network'],
    ['csrf', '503'],
    ['refresh', '503'],
    ['profile', '503'],
  ] as const)(
    'stops after %s %s without automatic retry',
    async (step, failure) => {
      const order: RestorationStep[] = []
      server.use(...handlers(order, step, failure))
      const { cache, coordinator, navigate, queryClient, sessionStore } =
        createHarness()
      cache.clearForAccountChange()

      await expect(
        coordinator.restoreReplacement(PREVIOUS_IDENTITY),
      ).resolves.toBe('unavailable')

      expect(order.at(-1)).toBe(step)
      expect(order.filter((value) => value === step)).toHaveLength(1)
      expect(sessionStore.getState()).toMatchObject({
        status: 'unavailable',
        context: 'initial-restoration',
        accessToken: undefined,
        csrfToken: undefined,
        identity: undefined,
      })
      expect(queryClient.getQueryCache().getAll()).toEqual([])
      expect(navigate).toHaveBeenCalledOnce()
      expect(navigate).toHaveBeenCalledWith('/unavailable')
    },
  )
})
