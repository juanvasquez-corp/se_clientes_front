import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { userResponseSchema } from '../../contracts/schemas/user'
import { createApiClient } from '../http/api-client'
import { createAuthClient } from '../http/auth-client'
import { server } from '../../test/server'
import {
  directCriticalOperations,
  silentSessionSignals,
} from '../../test/session-test-ports'
import { createAuthApi } from './auth-api'
import { createSessionStore } from './session-store'

const API_BASE_URL = 'https://api.example.test/api'
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const PASSWORD = 'private password value'
const TOKEN_RESPONSE = {
  access_token: 'private-access-value',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'private-csrf-value',
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

function createRealLoginPort() {
  const sessionStore = createSessionStore()
  const authClient = createAuthClient({
    apiBaseUrl: API_BASE_URL,
    getCsrfToken: () => sessionStore.getState().csrfToken,
  })
  const apiClient = createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => sessionStore.getState().accessToken,
    sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
  })
  const criticalOperation = vi.fn()
  const publish = vi.fn()

  return {
    sessionStore,
    criticalOperation,
    publish,
    authApi: createAuthApi({
      authClient,
      apiClient,
      sessionStore,
      criticalOperations: {
        run(operation, task) {
          criticalOperation(operation)
          return Promise.resolve().then(task)
        },
      },
      sessionSignals: { publish },
    }),
  }
}

function createRealSessionPort() {
  const sessionStore = createSessionStore({
    now: () => new Date('2026-10-08T12:00:00.000Z'),
  })
  let csrfToken: string | undefined
  let accessToken: string | undefined
  const authClient = createAuthClient({
    apiBaseUrl: API_BASE_URL,
    getCsrfToken: () => csrfToken,
  })
  const apiClient = createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => accessToken,
    sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
  })

  return {
    sessionStore,
    apiClient,
    authApi: createAuthApi({
      authClient,
      apiClient,
      sessionStore,
      criticalOperations: directCriticalOperations,
      sessionSignals: silentSessionSignals,
    }),
    setCsrfToken(value: string) {
      csrfToken = value
    },
    setAccessToken(value: string) {
      accessToken = value
    },
  }
}

describe('auth API login orchestration', () => {
  it('posts exact credentials, validates tokens, then loads the strict public profile', async () => {
    const requestOrder: string[] = []
    const storageSetItem = vi.spyOn(Storage.prototype, 'setItem')
    const initialCookie = document.cookie

    server.use(
      http.post('https://api.example.test/api/auth/login', async ({ request }) => {
        requestOrder.push('login')
        expect(request.credentials).toBe('include')
        expect(request.headers.get('x-requested-with')).toBe('XMLHttpRequest')
        expect(await request.json()).toEqual({
          email: 'ana@example.com',
          password: PASSWORD,
        })
        return HttpResponse.json(TOKEN_RESPONSE)
      }),
      http.get('https://api.example.test/api/users/me', ({ request }) => {
        requestOrder.push('profile')
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${TOKEN_RESPONSE.access_token}`,
        )
        expect(request.credentials).not.toBe('include')
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const { authApi, criticalOperation, publish, sessionStore } =
      createRealLoginPort()

    await expect(
      authApi.login({ email: 'ana@example.com', password: PASSWORD }),
    ).resolves.toEqual({
      kind: 'authenticated',
      identity: {
        userUuid: USER_UUID,
        name: 'Ana',
        lastName: 'Pérez',
        email: 'ana@example.com',
        phoneNumber: '3001234567',
        role: 'master',
        isActive: true,
      },
    })

    expect(requestOrder).toEqual(['login', 'profile'])
    expect(criticalOperation).toHaveBeenCalledWith('login')
    expect(publish).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith('session-replaced')
    expect(sessionStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: TOKEN_RESPONSE.access_token,
      tokenType: 'bearer',
      expiresIn: 120,
      csrfToken: TOKEN_RESPONSE.csrf_token,
      identity: {
        userUuid: USER_UUID,
        role: 'master',
      },
    })
    expect(storageSetItem).not.toHaveBeenCalled()
    expect(document.cookie).toBe(initialCookie)
    expect(JSON.stringify(sessionStore.getState())).not.toContain(PASSWORD)
  })

  it('rejects an invalid token contract before requesting the profile', async () => {
    let profileRequests = 0
    server.use(
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json({ ...TOKEN_RESPONSE, refresh_token: 'must-not-be-public' }),
      ),
      http.get('https://api.example.test/api/users/me', () => {
        profileRequests += 1
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const { authApi, publish, sessionStore } = createRealLoginPort()

    await expect(
      authApi.login({ email: 'ana@example.com', password: PASSWORD }),
    ).resolves.toEqual({ kind: 'technical' })
    expect(profileRequests).toBe(0)
    expect(publish).not.toHaveBeenCalled()
    expect(sessionStore.getState()).toMatchObject({
      status: 'unknown',
      accessToken: undefined,
      identity: undefined,
    })
  })

  it('clears partial session data and returns a controlled error for an invalid profile', async () => {
    server.use(
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json(TOKEN_RESPONSE),
      ),
      http.get('https://api.example.test/api/users/me', () =>
        HttpResponse.json({ ...USER_RESPONSE, document_number: 'must-not-be-public' }),
      ),
    )
    const { authApi, publish, sessionStore } = createRealLoginPort()
    const outcome = await authApi.login({ email: 'ana@example.com', password: PASSWORD })

    expect(outcome).toEqual({ kind: 'technical' })
    expect(publish).not.toHaveBeenCalled()
    expect(sessionStore.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      tokenType: undefined,
      expiresIn: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    const serializedError = JSON.stringify(outcome)
    expect(serializedError).not.toContain(PASSWORD)
    expect(serializedError).not.toContain(TOKEN_RESPONSE.access_token)
    expect(serializedError).not.toContain(TOKEN_RESPONSE.csrf_token)
    expect(serializedError).not.toContain('Axios')
  })

  it('rejects an impossible profile role without establishing identity', async () => {
    server.use(
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json(TOKEN_RESPONSE),
      ),
      http.get('https://api.example.test/api/users/me', () =>
        HttpResponse.json({ ...USER_RESPONSE, role: 'operator' }),
      ),
    )
    const { authApi, sessionStore } = createRealLoginPort()

    await expect(
      authApi.login({ email: 'ana@example.com', password: PASSWORD }),
    ).resolves.toEqual({ kind: 'technical' })
    expect(sessionStore.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      identity: undefined,
    })
  })

  it.each([
    'Credenciales incorrectas',
    'Cuenta inactiva',
    'Cuenta eliminada',
  ])('classifies every login 401 without using backend detail: %s', async (detail) => {
    server.use(
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json({ detail }, { status: 401 }),
      ),
    )
    const { authApi } = createRealLoginPort()

    await expect(
      authApi.login({ email: 'ana@example.com', password: PASSWORD }),
    ).resolves.toEqual({ kind: 'credentials-rejected' })
  })

  it.each([
    ['120', 'Primer mensaje'],
    [null, 'Texto completamente distinto'],
  ])(
    'returns only the sanitized Retry-After value for login 429: %s',
    async (retryAfter, detail) => {
      server.use(
        http.post('https://api.example.test/api/auth/login', () =>
          HttpResponse.json(
            { detail },
            {
              status: 429,
              headers: retryAfter === null ? {} : { 'Retry-After': retryAfter },
            },
          ),
        ),
      )
      const { authApi } = createRealLoginPort()

      const outcome = await authApi.login({
        email: 'ana@example.com',
        password: PASSWORD,
      })

      expect(outcome).toEqual({ kind: 'rate-limited', retryAfter })
      expect(JSON.stringify(outcome)).not.toContain(detail)
    },
  )
})

describe('session auth API', () => {
  it('makes the ordered CSRF, refresh and profile ports available with exact browser policy', async () => {
    const requestOrder: string[] = []
    server.use(
      http.get('https://api.example.test/api/auth/csrf', ({ request }) => {
        requestOrder.push('csrf')
        expect(request.credentials).toBe('include')
        expect(request.headers.get('x-requested-with')).toBe('XMLHttpRequest')
        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(request.headers.has('authorization')).toBe(false)
        return HttpResponse.json({ csrf_token: 'current-csrf-value' })
      }),
      http.post('https://api.example.test/api/auth/refresh', ({ request }) => {
        requestOrder.push('refresh')
        expect(request.credentials).toBe('include')
        expect(request.headers.get('x-requested-with')).toBe('XMLHttpRequest')
        expect(request.headers.get('x-csrf-token')).toBe('current-csrf-value')
        expect(request.headers.has('authorization')).toBe(false)
        return HttpResponse.json(TOKEN_RESPONSE)
      }),
      http.get('https://api.example.test/api/users/me', ({ request }) => {
        requestOrder.push('profile')
        expect(request.credentials).not.toBe('include')
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${TOKEN_RESPONSE.access_token}`,
        )
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const port = createRealSessionPort()

    const csrf = await port.authApi.getCsrf()
    expect(csrf).toEqual({ kind: 'success', csrfToken: 'current-csrf-value' })
    if (csrf.kind !== 'success') throw new Error('Expected a validated CSRF response')
    port.setCsrfToken(csrf.csrfToken)

    const refresh = await port.authApi.refresh()
    expect(refresh).toEqual({
      kind: 'success',
      tokens: {
        accessToken: TOKEN_RESPONSE.access_token,
        tokenType: 'bearer',
        expiresIn: 120,
        csrfToken: TOKEN_RESPONSE.csrf_token,
      },
    })
    if (refresh.kind !== 'success') throw new Error('Expected validated refreshed tokens')
    port.setAccessToken(refresh.tokens.accessToken)

    await expect(
      port.apiClient.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toMatchObject({ kind: 'success', data: USER_RESPONSE })
    expect(requestOrder).toEqual(['csrf', 'refresh', 'profile'])
    expect(port.sessionStore.getState()).toMatchObject({
      status: 'unknown',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
  })

  it('reports logout success without declaring the local session closed', async () => {
    server.use(
      http.post('https://api.example.test/api/auth/logout', ({ request }) => {
        expect(request.credentials).toBe('include')
        expect(request.headers.get('x-requested-with')).toBe('XMLHttpRequest')
        expect(request.headers.get('x-csrf-token')).toBe('private-csrf-value')
        return HttpResponse.json({ detail: 'Sesión finalizada' })
      }),
    )
    const port = createRealSessionPort()
    port.setCsrfToken('private-csrf-value')
    port.sessionStore.getState().acceptTokens({
      accessToken: 'private-access-value',
      tokenType: 'bearer',
      expiresIn: 120,
      csrfToken: 'private-csrf-value',
    })
    port.sessionStore.getState().acceptIdentity({
      userUuid: USER_UUID,
      name: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
      phoneNumber: '3001234567',
      role: 'master',
      isActive: true,
    })
    const before = port.sessionStore.getState()

    await expect(port.authApi.logout()).resolves.toEqual({ kind: 'success' })
    expect(port.sessionStore.getState()).toBe(before)
  })

  it.each([
    ['csrf', 401, 'unauthorized'],
    ['csrf', 403, 'forbidden'],
    ['csrf', 503, 'unavailable'],
    ['refresh', 401, 'unauthorized'],
    ['refresh', 403, 'forbidden'],
    ['refresh', 503, 'unavailable'],
    ['logout', 403, 'forbidden'],
    ['logout', 503, 'unavailable'],
  ] as const)(
    'sanitizes %s HTTP %s as %s without retry or store effects',
    async (operation, status, kind) => {
      const privateBody = `private-${operation}-${status.toString()}-body`
      let requests = 0
      const method = operation === 'csrf' ? 'get' : 'post'
      server.use(
        http[method](`https://api.example.test/api/auth/${operation}`, () => {
          requests += 1
          return HttpResponse.json({ detail: privateBody }, { status })
        }),
      )
      const port = createRealSessionPort()
      port.setCsrfToken('private-csrf-value')
      const before = port.sessionStore.getState()

      const outcome =
        operation === 'csrf'
          ? await port.authApi.getCsrf()
          : operation === 'refresh'
            ? await port.authApi.refresh()
            : await port.authApi.logout()

      expect(outcome).toEqual({ kind, status })
      expect(requests).toBe(1)
      expect(port.sessionStore.getState()).toBe(before)
      const serialized = JSON.stringify(outcome)
      expect(serialized).not.toContain(privateBody)
      expect(serialized).not.toContain('private-csrf-value')
      expect(serialized).not.toMatch(/axios|request|response|headers|config|cause/i)
    },
  )

  it('distinguishes a network failure from HTTP failures without retrying', async () => {
    let requests = 0
    server.use(
      http.post('https://api.example.test/api/auth/refresh', () => {
        requests += 1
        return HttpResponse.error()
      }),
    )
    const port = createRealSessionPort()
    port.setCsrfToken('private-csrf-value')

    await expect(port.authApi.refresh()).resolves.toEqual({
      kind: 'unavailable',
      status: undefined,
    })
    expect(requests).toBe(1)
  })

  it.each(['refresh', 'logout'] as const)(
    'rejects %s without CSRF before the network',
    async (operation) => {
      let requests = 0
      server.use(
        http.post(`https://api.example.test/api/auth/${operation}`, () => {
          requests += 1
          return HttpResponse.json({ detail: 'unexpected request' })
        }),
      )
      const { authApi } = createRealSessionPort()

      const outcome =
        operation === 'refresh' ? await authApi.refresh() : await authApi.logout()

      expect(outcome).toEqual({ kind: 'missing-csrf', status: undefined })
      expect(requests).toBe(0)
    },
  )

  it.each([
    [
      'csrf',
      'get',
      '/api/auth/csrf',
      { csrf_token: 'private-contract-diagnostic', extra: true },
    ],
    [
      'refresh',
      'post',
      '/api/auth/refresh',
      {
        ...TOKEN_RESPONSE,
        access_token: 'private-contract-diagnostic',
        expires_in: 0,
      },
    ],
    [
      'logout',
      'post',
      '/api/auth/logout',
      { detail: 'private-contract-diagnostic', extra: true },
    ],
  ] as const)(
    'rejects an invalid %s success contract without exposing its body',
    async (operation, method, path, body) => {
      const privateValue = 'private-contract-diagnostic'
      server.use(
        http[method](`https://api.example.test${path}`, () =>
          HttpResponse.json(body),
        ),
      )
      const port = createRealSessionPort()
      port.setCsrfToken('private-csrf-value')

      const outcome =
        operation === 'csrf'
          ? await port.authApi.getCsrf()
          : operation === 'refresh'
            ? await port.authApi.refresh()
            : await port.authApi.logout()

      expect(outcome).toEqual({ kind: 'technical', status: undefined })
      expect(JSON.stringify(outcome)).not.toContain(privateValue)
    },
  )
})
