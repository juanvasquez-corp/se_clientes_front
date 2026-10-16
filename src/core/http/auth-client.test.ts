import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../test/server'
import {
  AuthRequestError,
  createAuthClient,
  type AuthClientConfig,
} from './auth-client'
import { ApiError } from './errors'

const API_BASE_URL = 'https://api.example.test/api'
const TOKEN_RESPONSE = {
  access_token: 'access-value',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'next-csrf-value',
}

function createConfig(overrides: Partial<AuthClientConfig> = {}): AuthClientConfig {
  return {
    apiBaseUrl: API_BASE_URL,
    getCsrfToken: () => 'csrf-value',
    ...overrides,
  }
}

function expectBrowserIntent(request: Request): void {
  expect(request.headers.get('x-requested-with')).toBe('XMLHttpRequest')
  expect(request.credentials).toBe('include')
  expect(request.headers.has('authorization')).toBe(false)
}

describe('authClient network policy', () => {
  it('requests CSRF with browser intent and credentials but no CSRF header', async () => {
    server.use(
      http.get('https://api.example.test/api/auth/csrf', ({ request }) => {
        expectBrowserIntent(request)
        expect(request.headers.has('x-csrf-token')).toBe(false)
        return HttpResponse.json({ csrf_token: 'csrf-value' })
      }),
    )

    await expect(createAuthClient(createConfig()).getCsrf()).resolves.toEqual({
      csrf_token: 'csrf-value',
    })
  })

  it('sends login as an allowlisted JSON body without CSRF or extra fields', async () => {
    server.use(
      http.post('https://api.example.test/api/auth/login', async ({ request }) => {
        expectBrowserIntent(request)
        expect(request.headers.has('x-csrf-token')).toBe(false)
        expect(request.headers.get('content-type')).toContain('application/json')
        expect(await request.json()).toEqual({
          email: 'ana@example.com',
          password: 'a-secure-initial-password',
        })
        return HttpResponse.json(TOKEN_RESPONSE)
      }),
    )

    const formState = {
      email: 'ana@example.com',
      password: 'a-secure-initial-password',
      remember: true,
    }

    await expect(createAuthClient(createConfig()).login(formState)).resolves.toEqual(
      TOKEN_RESPONSE,
    )
    expect(formState).toHaveProperty('remember', true)
  })

  it.each([
    ['refresh', '/api/auth/refresh', TOKEN_RESPONSE],
    ['logout', '/api/auth/logout', { detail: 'Sesión finalizada' }],
  ] as const)(
    'sends %s with the in-memory CSRF token, intent and credentials',
    async (operation, path, responseBody) => {
      server.use(
        http.post(`https://api.example.test${path}`, ({ request }) => {
          expectBrowserIntent(request)
          expect(request.headers.get('x-csrf-token')).toBe('csrf-value')
          return HttpResponse.json(responseBody)
        }),
      )

      const client = createAuthClient(createConfig())
      const result = operation === 'refresh' ? client.refresh() : client.logout()

      await expect(result).resolves.toEqual(responseBody)
    },
  )

  it.each(['refresh', 'logout'] as const)(
    'rejects %s before the network when the CSRF token is absent',
    async (operation) => {
      let requests = 0
      server.use(
        http.post(`https://api.example.test/api/auth/${operation}`, () => {
          requests += 1
          return HttpResponse.json({ detail: 'unexpected request' })
        }),
      )

      const client = createAuthClient(
        createConfig({ getCsrfToken: () => undefined }),
      )
      const result = operation === 'refresh' ? client.refresh() : client.logout()

      await expect(result).rejects.toMatchObject({
        name: 'AuthRequestError',
        reason: 'missing-csrf',
        message: 'No fue posible preparar la solicitud de autenticación.',
      })
      expect(requests).toBe(0)
    },
  )

  it('does not consult the CSRF provider for CSRF or login operations', async () => {
    const getCsrfToken = vi.fn<() => string | undefined>(() => 'private-csrf-value')
    server.use(
      http.get('https://api.example.test/api/auth/csrf', () =>
        HttpResponse.json({ csrf_token: 'csrf-value' }),
      ),
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json(TOKEN_RESPONSE),
      ),
    )
    const client = createAuthClient(createConfig({ getCsrfToken }))

    await client.getCsrf()
    await client.login({ email: 'ana@example.com', password: 'password-value' })

    expect(getCsrfToken).not.toHaveBeenCalled()
  })

  it('rejects an injected external endpoint before credentials or requests exist', async () => {
    let requests = 0
    const getCsrfToken = vi.fn<() => string | undefined>(() => 'private-csrf-value')
    server.use(
      http.post('https://external.example/api/auth/refresh', () => {
        requests += 1
        return HttpResponse.json(TOKEN_RESPONSE)
      }),
    )
    const client = createAuthClient(
      createConfig({
        getCsrfToken,
        endpoints: {
          csrf: '/auth/csrf',
          login: '/auth/login',
          refresh: 'https://external.example/api/auth/refresh',
          logout: '/auth/logout',
        },
      }),
    )

    let caughtError: unknown
    try {
      await client.refresh()
    } catch (error: unknown) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(AuthRequestError)
    expect(caughtError).toMatchObject({ reason: 'unsafe-target' })
    expect(JSON.stringify(caughtError)).not.toContain('external.example')
    expect(getCsrfToken).not.toHaveBeenCalled()
    expect(requests).toBe(0)
  })

  it('sanitizes rejected login bodies instead of exposing Axios request data', async () => {
    const privatePassword = 'private-password-value'
    server.use(
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json({ detail: 'Credenciales inválidas' }, { status: 401 }),
      ),
    )
    const client = createAuthClient(createConfig())
    let caughtError: unknown

    try {
      await client.login({ email: 'ana@example.com', password: privatePassword })
    } catch (error: unknown) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(ApiError)
    expect(JSON.stringify(caughtError)).not.toContain(privatePassword)
  })

  it('retains only the allowlisted Retry-After value from a login 429', async () => {
    const privatePassword = 'private-password-value'
    const privateHeader = 'private-header-value'
    const privateBody = 'private-body-value'
    server.use(
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json(
          { detail: privateBody },
          {
            status: 429,
            headers: {
              'Retry-After': '120',
              'X-Private-Diagnostic': privateHeader,
            },
          },
        ),
      ),
    )
    let caughtError: unknown

    try {
      await createAuthClient(createConfig()).login({
        email: 'ana@example.com',
        password: privatePassword,
      })
    } catch (error: unknown) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(ApiError)
    expect(caughtError).toMatchObject({
      failure: { kind: 'rate-limited', status: 429 },
      retryAfter: '120',
    })
    const serializedError = JSON.stringify(caughtError)
    expect(serializedError).not.toContain(privatePassword)
    expect(serializedError).not.toContain(privateHeader)
    expect(serializedError).not.toContain(privateBody)
    expect(serializedError).not.toMatch(/response|headers|config|request/i)
  })

  it('sanitizes rejected CSRF-protected requests without retaining the token', async () => {
    const privateCsrf = 'private-csrf-value'
    server.use(
      http.post('https://api.example.test/api/auth/refresh', () =>
        HttpResponse.json({ detail: 'Protección inválida' }, { status: 403 }),
      ),
    )
    const client = createAuthClient(
      createConfig({ getCsrfToken: () => privateCsrf }),
    )
    let caughtError: unknown

    try {
      await client.refresh()
    } catch (error: unknown) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(ApiError)
    expect(JSON.stringify(caughtError)).not.toContain(privateCsrf)
  })
})
