import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { messageResponseSchema } from '../../contracts/schemas/auth'
import { userResponseSchema } from '../../contracts/schemas/user'
import { server } from '../../test/server'
import {
  createApiClient,
  type RecoveryResult,
  type SessionRecovery,
} from './api-client'
import { classifyApiFailure } from './errors'
import { shouldRetryRead } from './request-policy'

const API_BASE_URL = 'https://api.example.test/api'
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const USER_RESPONSE = {
  uuid: USER_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  rol: 'master',
  is_active: true,
} as const

function recovery(result: RecoveryResult): SessionRecovery {
  return { recoverRead: vi.fn<SessionRecovery['recoverRead']>().mockResolvedValue(result) }
}

describe('apiClient 401 recovery', () => {
  it('recovers and repeats a protected read exactly once with the current token', async () => {
    let requests = 0
    let token = 'expired-token'
    const sessionRecovery: SessionRecovery = {
      recoverRead: vi.fn(() => {
        token = 'renewed-token'
        return Promise.resolve('recovered' as const)
      }),
    }
    server.use(
      http.get('https://api.example.test/api/users/me', ({ request }) => {
        requests += 1
        if (requests === 1) {
          expect(request.headers.get('authorization')).toBe('Bearer expired-token')
          return HttpResponse.json({ detail: 'first unauthorized' }, { status: 401 })
        }
        expect(request.headers.get('authorization')).toBe('Bearer renewed-token')
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => token,
      sessionRecovery,
    })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toEqual({ kind: 'success', data: USER_RESPONSE })
    expect(requests).toBe(2)
    expect(sessionRecovery.recoverRead).toHaveBeenCalledTimes(1)
  })

  it('does not recurse when the repeated read also returns 401', async () => {
    let requests = 0
    const sessionRecovery = recovery('recovered')
    server.use(
      http.get('https://api.example.test/api/users/me', () => {
        requests += 1
        return HttpResponse.json({ detail: 'still unauthorized' }, { status: 401 })
      }),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'access-value',
      sessionRecovery,
    })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toEqual({ kind: 'session', state: 'dead' })
    expect(requests).toBe(2)
    expect(sessionRecovery.recoverRead).toHaveBeenCalledTimes(1)
  })

  it.each(['dead', 'blocked', 'unavailable'] as const)(
    'does not repeat a read when recovery returns %s',
    async (state) => {
      let requests = 0
      const sessionRecovery = recovery(state)
      server.use(
        http.get('https://api.example.test/api/users/me', () => {
          requests += 1
          return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
        }),
      )
      const client = createApiClient({
        apiBaseUrl: API_BASE_URL,
        getAccessToken: () => 'access-value',
        sessionRecovery,
      })

      await expect(
        client.read({ target: '/users/me', schema: userResponseSchema }),
      ).resolves.toEqual({ kind: 'session', state })
      expect(requests).toBe(1)
      expect(sessionRecovery.recoverRead).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    ['POST', '/users/search', '/api/users/search'],
    ['PUT', '/users/me', '/api/users/me'],
    ['PATCH', `/users/${USER_UUID}/status`, `/api/users/${USER_UUID}/status`],
    ['DELETE', `/users/${USER_UUID}`, `/api/users/${USER_UUID}`],
  ] as const)(
    'never replays a %s mutation after recovered 401',
    async (method, target, path) => {
      let requests = 0
      const sessionRecovery = recovery('recovered')
      server.use(
        http.all(`https://api.example.test${path}`, ({ request }) => {
          expect(request.method).toBe(method)
          requests += 1
          return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
        }),
      )
      const client = createApiClient({
        apiBaseUrl: API_BASE_URL,
        getAccessToken: () => 'expired-token',
        sessionRecovery,
      })
      const source: Readonly<Record<string, unknown>> =
        method === 'PATCH' ? { is_active: false } : { email: 'ana@example.com' }
      const allowedKeys: readonly string[] =
        method === 'PATCH' ? ['is_active'] : ['email']

      const result =
        method === 'DELETE'
          ? client.remove({ target, schema: messageResponseSchema })
          : client.mutate({
              method,
              target,
              source,
              allowedKeys,
              schema: messageResponseSchema,
            })

      await expect(result).resolves.toEqual({ kind: 'requires-confirmation' })
      expect(requests).toBe(1)
      expect(sessionRecovery.recoverRead).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['dead', 'blocked', 'unavailable'] as const)(
    'returns the %s session outcome without replaying a mutation',
    async (state) => {
      let requests = 0
      const sessionRecovery = recovery(state)
      server.use(
        http.post('https://api.example.test/api/users/search', () => {
          requests += 1
          return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
        }),
      )
      const client = createApiClient({
        apiBaseUrl: API_BASE_URL,
        getAccessToken: () => 'expired-token',
        sessionRecovery,
      })

      await expect(
        client.mutate({
          method: 'POST',
          target: '/users/search',
          source: { email: 'ana@example.com' },
          allowedKeys: ['email'],
          schema: userResponseSchema,
        }),
      ).resolves.toEqual({ kind: 'session', state })
      expect(requests).toBe(1)
      expect(sessionRecovery.recoverRead).toHaveBeenCalledTimes(1)
    },
  )

  it('returns only sanitized public outcomes', async () => {
    const sessionRecovery = recovery('recovered')
    server.use(
      http.post('https://api.example.test/api/users/search', () =>
        HttpResponse.json(
          { detail: 'unauthorized', access_token: 'private-token', body: 'private-body' },
          { status: 401 },
        ),
      ),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'private-token',
      sessionRecovery,
    })

    const outcome = await client.mutate({
      method: 'POST',
      target: '/users/search',
      source: { email: 'ana@example.com' },
      allowedKeys: ['email'],
      schema: userResponseSchema,
    })

    expect(outcome).toEqual({ kind: 'requires-confirmation' })
    expect(JSON.stringify(outcome)).not.toContain('private')
  })
})

describe('shouldRetryRead', () => {
  it('allows only the first controlled recovery of a 401 read', () => {
    const unauthorized = classifyApiFailure(401, { detail: 'unauthorized' })

    expect(shouldRetryRead(0, unauthorized)).toBe(true)
    expect(shouldRetryRead(1, unauthorized)).toBe(false)
  })

  it.each([undefined, 400, 403, 404, 409, 413, 415, 422, 429, 503])(
    'does not automatically retry status %s',
    (status) => {
      expect(shouldRetryRead(0, classifyApiFailure(status, { detail: 'any' }))).toBe(
        false,
      )
    },
  )
})
