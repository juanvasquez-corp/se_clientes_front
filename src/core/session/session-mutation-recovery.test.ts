import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { createRemoteCacheController } from '../../app/query-client'
import { messageResponseSchema } from '../../contracts/schemas/auth'
import { userResponseSchema } from '../../contracts/schemas/user'
import { createTestQueryClient } from '../../test/create-test-query-client'
import { server } from '../../test/server'
import {
  directCriticalOperations,
  silentSessionSignals,
} from '../../test/session-test-ports'
import { createApiClient, type ApiClient } from '../http/api-client'
import { createAuthClient } from '../http/auth-client'
import { createAuthApi } from './auth-api'
import { createInitialSessionCoordinator } from './session-coordinator'
import { createSessionStore } from './session-store'

const API_BASE_URL = 'https://api.example.test/api'
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const RENEWED_TOKENS = {
  access_token: 'renewed-access-value',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'renewed-csrf-value',
}
const USER_RESPONSE = {
  uuid: USER_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  rol: 'master',
  is_active: true,
} as const

type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const MUTATIONS = [
  ['POST', '/users/search', '/api/users/search'],
  ['PUT', '/users/me', '/api/users/me'],
  ['PATCH', `/users/${USER_UUID}/status`, `/api/users/${USER_UUID}/status`],
  ['DELETE', `/users/${USER_UUID}`, `/api/users/${USER_UUID}`],
] as const satisfies readonly (readonly [MutationMethod, string, string])[]

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
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role: 'master',
    isActive: true,
  })
}

function createMutationHarness() {
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
    (destination: '/login' | '/forbidden' | '/unavailable') => void
  >()
  const coordinator = createInitialSessionCoordinator({
    authApi,
    profileApi: bootstrapApiClient,
    sessionStore,
    remoteCache: createRemoteCacheController(queryClient),
    navigate,
    criticalOperations: directCriticalOperations,
  })
  const apiClient = createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => sessionStore.getState().getAccessToken(),
    sessionRecovery: coordinator,
  })

  return { apiClient, coordinator, navigate, queryClient, sessionStore }
}

function sourceFor(method: Exclude<MutationMethod, 'DELETE'>) {
  switch (method) {
    case 'POST':
      return {
        source: {
          email: 'ana@example.com',
          psswd: 'private-password-value',
          cedula: 'private-identity-value',
        },
        allowedKeys: ['email'] as const,
      }
    case 'PUT':
      return {
        source: {
          name: 'Ana',
          email: 'ana@example.com',
          psswd: 'private-password-value',
          cedula: 'private-identity-value',
        },
        allowedKeys: ['name', 'email'] as const,
      }
    case 'PATCH':
      return {
        source: {
          is_active: false,
          psswd: 'private-password-value',
          cedula: 'private-identity-value',
        },
        allowedKeys: ['is_active'] as const,
      }
  }
}

function sendMutation(
  apiClient: ApiClient,
  method: MutationMethod,
  target: string,
) {
  if (method === 'DELETE') {
    return apiClient.remove({ target, schema: messageResponseSchema })
  }
  if (method === 'POST') {
    const request = sourceFor(method)
    return apiClient.mutate({
      method,
      target,
      source: request.source,
      allowedKeys: request.allowedKeys,
      schema: userResponseSchema,
    })
  }
  if (method === 'PUT') {
    const request = sourceFor(method)
    return apiClient.mutate({
      method,
      target,
      source: request.source,
      allowedKeys: request.allowedKeys,
      schema: messageResponseSchema,
    })
  }
  const request = sourceFor(method)
  return apiClient.mutate({
    method,
    target,
    source: request.source,
    allowedKeys: request.allowedKeys,
    schema: messageResponseSchema,
  })
}

describe('mutation 401 policy with the real session coordinator', () => {
  it.each(MUTATIONS)(
    'never replays %s and requires explicit confirmation after refresh',
    async (method, target, path) => {
      let mutationRequests = 0
      let refreshRequests = 0
      server.use(
        http.all(`https://api.example.test${path}`, async ({ request }) => {
          mutationRequests += 1
          expect(request.method).toBe(method)
          expect(request.headers.get('authorization')).toBe(
            'Bearer expired-access-value',
          )
          expect(request.headers.has('idempotency-key')).toBe(false)
          if (method !== 'DELETE') {
            const body = await request.json()
            expect(JSON.stringify(body)).not.toMatch(/psswd|password|cedula/i)
          }
          return HttpResponse.json({ detail: 'expired' }, { status: 401 })
        }),
        http.post('https://api.example.test/api/auth/refresh', () => {
          refreshRequests += 1
          return HttpResponse.json(RENEWED_TOKENS)
        }),
      )
      const { apiClient, queryClient, sessionStore } = createMutationHarness()
      queryClient.setQueryData(['private', 'context'], { preserve: true })

      const outcome = await sendMutation(apiClient, method, target)

      expect(outcome).toEqual({
        kind: 'requires-confirmation',
        sensitiveInput: 'clear',
      })
      expect(mutationRequests).toBe(1)
      expect(refreshRequests).toBe(1)
      expect(sessionStore.getState()).toMatchObject({
        status: 'authenticated',
        accessToken: RENEWED_TOKENS.access_token,
        csrfToken: RENEWED_TOKENS.csrf_token,
      })
      expect(queryClient.getQueryData(['private', 'context'])).toEqual({
        preserve: true,
      })
      const serialized = JSON.stringify(outcome)
      expect(serialized).not.toMatch(
        /private|password|psswd|cedula|access|csrf|axios|config|request|response/i,
      )
    },
  )

  it('sends a second mutation only after the consumer explicitly confirms', async () => {
    let mutationRequests = 0
    let refreshRequests = 0
    server.use(
      http.post('https://api.example.test/api/users/search', ({ request }) => {
        mutationRequests += 1
        return request.headers.get('authorization') === 'Bearer expired-access-value'
          ? HttpResponse.json({ detail: 'expired' }, { status: 401 })
          : HttpResponse.json(USER_RESPONSE)
      }),
      http.post('https://api.example.test/api/auth/refresh', () => {
        refreshRequests += 1
        return HttpResponse.json(RENEWED_TOKENS)
      }),
    )
    const { apiClient } = createMutationHarness()

    await expect(
      sendMutation(apiClient, 'POST', '/users/search'),
    ).resolves.toEqual({
      kind: 'requires-confirmation',
      sensitiveInput: 'clear',
    })
    expect(mutationRequests).toBe(1)
    expect(refreshRequests).toBe(1)

    await expect(
      sendMutation(apiClient, 'POST', '/users/search'),
    ).resolves.toEqual({ kind: 'success', data: USER_RESPONSE })
    expect(mutationRequests).toBe(2)
    expect(refreshRequests).toBe(1)
  })

  it('shares one refresh across simultaneous mutations without replaying either', async () => {
    let postRequests = 0
    let patchRequests = 0
    let refreshRequests = 0
    server.use(
      http.post('https://api.example.test/api/users/search', () => {
        postRequests += 1
        return HttpResponse.json({ detail: 'expired post' }, { status: 401 })
      }),
      http.patch(
        `https://api.example.test/api/users/${USER_UUID}/status`,
        () => {
          patchRequests += 1
          return HttpResponse.json({ detail: 'expired patch' }, { status: 401 })
        },
      ),
      http.post('https://api.example.test/api/auth/refresh', () => {
        refreshRequests += 1
        return HttpResponse.json(RENEWED_TOKENS)
      }),
    )
    const { apiClient } = createMutationHarness()

    const outcomes = await Promise.all([
      sendMutation(apiClient, 'POST', '/users/search'),
      sendMutation(apiClient, 'PATCH', `/users/${USER_UUID}/status`),
    ])

    expect(outcomes).toEqual([
      { kind: 'requires-confirmation', sensitiveInput: 'clear' },
      { kind: 'requires-confirmation', sensitiveInput: 'clear' },
    ])
    expect(postRequests).toBe(1)
    expect(patchRequests).toBe(1)
    expect(refreshRequests).toBe(1)
  })

  it.each([
    ['401', 'dead'],
    ['403', 'blocked'],
    ['network', 'unavailable'],
    ['500', 'unavailable'],
    ['503', 'unavailable'],
  ] as const)(
    'does not replay a mutation when refresh ends as %s',
    async (failure, expectedState) => {
      let mutationRequests = 0
      let refreshRequests = 0
      const privateDetail = `private-${failure}-detail`
      server.use(
        http.post('https://api.example.test/api/users/search', () => {
          mutationRequests += 1
          return HttpResponse.json({ detail: 'expired' }, { status: 401 })
        }),
        http.post('https://api.example.test/api/auth/refresh', () => {
          refreshRequests += 1
          if (failure === 'network') return HttpResponse.error()
          return HttpResponse.json(
            { detail: privateDetail },
            { status: Number(failure) },
          )
        }),
      )
      const { apiClient, navigate, queryClient, sessionStore } =
        createMutationHarness()
      queryClient.setQueryData(['private', 'context'], { preserve: true })

      const outcome = await sendMutation(apiClient, 'POST', '/users/search')

      expect(outcome).toEqual({ kind: 'session', state: expectedState })
      expect(mutationRequests).toBe(1)
      expect(refreshRequests).toBe(1)
      expect(JSON.stringify(outcome)).not.toContain(privateDetail)
      expect(sessionStore.getState().status).toBe(expectedState)
      if (expectedState === 'dead') {
        expect(queryClient.getQueryCache().getAll()).toEqual([])
        expect(navigate).toHaveBeenCalledWith('/login')
      } else {
        expect(queryClient.getQueryData(['private', 'context'])).toEqual({
          preserve: true,
        })
      }
    },
  )
})
