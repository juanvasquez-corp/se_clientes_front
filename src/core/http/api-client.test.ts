import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { messageResponseSchema } from '../../contracts/schemas/auth'
import { userResponseSchema } from '../../contracts/schemas/user'
import { server } from '../../test/server'
import { createApiClient } from './api-client'
import { ContractError } from './errors'

const API_BASE_URL = 'https://api.example.test/api'
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const USER_RESPONSE = {
  uuid: USER_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  role: 'master',
  is_active: true,
} as const
const MUTATION_RESPONSE_SCHEMA = z.union([userResponseSchema, messageResponseSchema])
const NO_SESSION_RECOVERY = {
  recoverRead: () => Promise.resolve('dead' as const),
}

function expectUserAuthorization(request: Request): void {
  expect(request.headers.get('authorization')).toBe('Bearer access-value')
  expect(request.headers.has('x-csrf-token')).toBe(false)
  expect(request.headers.has('x-requested-with')).toBe(false)
  expect(request.credentials).not.toBe('include')
}

describe('apiClient network policy', () => {
  it('reads a validated user with bearer and no request body', async () => {
    server.use(
      http.get('https://api.example.test/api/users/me', async ({ request }) => {
        expectUserAuthorization(request)
        expect(await request.text()).toBe('')
        expect(request.headers.has('content-type')).toBe(false)
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'access-value',
      sessionRecovery: NO_SESSION_RECOVERY,
    })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toEqual({ kind: 'success', data: USER_RESPONSE })
  })

  it.each([
    {
      method: 'POST' as const,
      target: '/users/search',
      path: '/api/users/search',
      source: { email: 'ana@example.com', ignored: true },
      allowedKeys: ['email'] as const,
      expectedBody: { email: 'ana@example.com' },
      response: USER_RESPONSE,
    },
    {
      method: 'PUT' as const,
      target: '/users/me',
      path: '/api/users/me',
      source: {
        name: 'Ana',
        last_name: null,
        phone_number: null,
        email: 'ana@example.com',
        role: 'superadmin',
      },
      allowedKeys: ['name', 'last_name', 'phone_number', 'email'] as const,
      expectedBody: {
        name: 'Ana',
        last_name: null,
        phone_number: null,
        email: 'ana@example.com',
      },
      response: USER_RESPONSE,
    },
    {
      method: 'PATCH' as const,
      target: `/users/${USER_UUID}/status`,
      path: `/api/users/${USER_UUID}/status`,
      source: { is_active: false, ignored: 'value' },
      allowedKeys: ['is_active'] as const,
      expectedBody: { is_active: false },
      response: { detail: 'Estado actualizado' },
    },
  ])(
    'sends an allowlisted JSON body for $method $path',
    async ({ method, target, path, source, allowedKeys, expectedBody, response }) => {
      server.use(
        http.all(`https://api.example.test${path}`, async ({ request }) => {
          expect(request.method).toBe(method)
          expectUserAuthorization(request)
          expect(request.headers.get('content-type')).toContain('application/json')
          expect(await request.json()).toEqual(expectedBody)
          return HttpResponse.json(response)
        }),
      )
      const client = createApiClient({
        apiBaseUrl: API_BASE_URL,
        getAccessToken: () => 'access-value',
        sessionRecovery: NO_SESSION_RECOVERY,
      })

      await expect(
        client.mutate({
          method,
          target,
          source,
          allowedKeys,
          schema: MUTATION_RESPONSE_SCHEMA,
        }),
      ).resolves.toEqual({ kind: 'success', data: response })
    },
  )

  it('deletes with bearer and without inventing a body', async () => {
    server.use(
      http.delete(`https://api.example.test/api/users/${USER_UUID}`, async ({ request }) => {
        expectUserAuthorization(request)
        expect(await request.text()).toBe('')
        expect(request.headers.has('content-type')).toBe(false)
        return HttpResponse.json({ detail: 'Usuario eliminado' })
      }),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'access-value',
      sessionRecovery: NO_SESSION_RECOVERY,
    })

    await expect(
      client.remove({
        target: `/users/${USER_UUID}`,
        schema: messageResponseSchema,
      }),
    ).resolves.toEqual({
      kind: 'success',
      data: { detail: 'Usuario eliminado' },
    })
  })

  it('rejects a missing access token before the network with a sanitized error', async () => {
    let requests = 0
    server.use(
      http.get('https://api.example.test/api/users/me', () => {
        requests += 1
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => undefined,
      sessionRecovery: NO_SESSION_RECOVERY,
    })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      reason: 'missing-token',
      message: 'No fue posible preparar la solicitud de usuarios.',
    })
    expect(requests).toBe(0)
  })

  it.each([
    'https://external.example/api/users/me',
    '/auth/refresh',
    '/users/arbitrary-value',
  ])('rejects unsafe target %s before reading or leaking the token', async (target) => {
    const getAccessToken = vi.fn<() => string | undefined>(() => 'private-access-value')
    let requests = 0
    server.use(
      http.get('https://external.example/api/users/me', ({ request }) => {
        requests += 1
        expect(request.headers.has('authorization')).toBe(false)
        return HttpResponse.json(USER_RESPONSE)
      }),
      http.post('https://api.example.test/api/auth/refresh', ({ request }) => {
        requests += 1
        expect(request.headers.has('authorization')).toBe(false)
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken,
      sessionRecovery: NO_SESSION_RECOVERY,
    })

    await expect(client.read({ target, schema: userResponseSchema })).rejects.toMatchObject({
      reason: 'unsafe-target',
    })
    expect(getAccessToken).not.toHaveBeenCalled()
    expect(requests).toBe(0)
  })

  it('propagates AbortSignal and never delivers a late response', async () => {
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    server.use(
      http.get('https://api.example.test/api/users/me', async ({ request }) => {
        markStarted?.()
        await new Promise<void>((resolve) => {
          request.signal.addEventListener(
            'abort',
            () => {
              resolve()
            },
            { once: true },
          )
        })
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'access-value',
      sessionRecovery: NO_SESSION_RECOVERY,
    })
    const controller = new AbortController()
    let delivered = false
    const pending = client
      .read({ target: '/users/me', schema: userResponseSchema, signal: controller.signal })
      .then((data) => {
        delivered = true
        return data
      })

    await started
    controller.abort()

    await expect(pending).rejects.toMatchObject({
      name: 'ApiRequestError',
      reason: 'cancelled',
    })
    expect(delivered).toBe(false)
  })

  it('rejects an invalid success response before delivering data', async () => {
    server.use(
      http.get('https://api.example.test/api/users/me', () =>
        HttpResponse.json({ ...USER_RESPONSE, document_number: 'private-value' }),
      ),
    )
    const client = createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'access-value',
      sessionRecovery: NO_SESSION_RECOVERY,
    })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).rejects.toBeInstanceOf(ContractError)
  })
})
