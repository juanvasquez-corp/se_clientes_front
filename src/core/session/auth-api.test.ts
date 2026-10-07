import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from '../http/api-client'
import { createAuthClient } from '../http/auth-client'
import { server } from '../../test/server'
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
  rol: 'master',
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

  return {
    sessionStore,
    authApi: createAuthApi({ authClient, apiClient, sessionStore }),
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
          psswd: PASSWORD,
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
    const { authApi, sessionStore } = createRealLoginPort()

    await expect(
      authApi.login({ email: 'ana@example.com', psswd: PASSWORD }),
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
    const { authApi, sessionStore } = createRealLoginPort()

    await expect(
      authApi.login({ email: 'ana@example.com', psswd: PASSWORD }),
    ).resolves.toEqual({ kind: 'technical' })
    expect(profileRequests).toBe(0)
    expect(sessionStore.getState()).toMatchObject({
      status: 'anonymous',
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
        HttpResponse.json({ ...USER_RESPONSE, cedula: 'must-not-be-public' }),
      ),
    )
    const { authApi, sessionStore } = createRealLoginPort()
    const outcome = await authApi.login({ email: 'ana@example.com', psswd: PASSWORD })

    expect(outcome).toEqual({ kind: 'technical' })
    expect(sessionStore.getState()).toMatchObject({
      status: 'anonymous',
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
        HttpResponse.json({ ...USER_RESPONSE, rol: 'operator' }),
      ),
    )
    const { authApi, sessionStore } = createRealLoginPort()

    await expect(
      authApi.login({ email: 'ana@example.com', psswd: PASSWORD }),
    ).resolves.toEqual({ kind: 'technical' })
    expect(sessionStore.getState()).toMatchObject({
      status: 'anonymous',
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
      authApi.login({ email: 'ana@example.com', psswd: PASSWORD }),
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
        psswd: PASSWORD,
      })

      expect(outcome).toEqual({ kind: 'rate-limited', retryAfter })
      expect(JSON.stringify(outcome)).not.toContain(detail)
    },
  )
})
