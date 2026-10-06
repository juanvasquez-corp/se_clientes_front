import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { userResponseSchema } from '../../contracts/schemas/user'
import { server } from '../../test/server'
import { createApiClient, type SessionRecovery } from './api-client'
import { ApiError, ContractError } from './errors'
import { mapValidationIssues } from './validation-errors'

const API_BASE_URL = 'https://api.example.test/api'
const USER_RESPONSE = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  rol: 'master',
  is_active: true,
} as const

function createClient(sessionRecovery: SessionRecovery) {
  return createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => 'access-value',
    sessionRecovery,
  })
}

describe('HTTP integration matrix', () => {
  it.each([
    [400, { detail: 'first message' }, 'bad-request'],
    [403, { detail: 'second message' }, 'forbidden'],
    [404, { detail: 'third message' }, 'not-found'],
    [409, { detail: 'safe business explanation' }, 'conflict'],
    [413, { detail: 'fifth message' }, 'payload-too-large'],
    [415, { detail: 'sixth message' }, 'unsupported-media-type'],
    [
      422,
      { detail: [{ type: 'missing', loc: ['body', 'email'], msg: 'Required' }] },
      'validation',
    ],
    [429, { detail: 'eighth message' }, 'rate-limited'],
    [503, { detail: 'ninth message' }, 'unavailable'],
  ] as const)(
    'classifies HTTP %s through Axios/MSW without automatic replay',
    async (status, body, expectedKind) => {
      let requests = 0
      const recoverRead = vi.fn<SessionRecovery['recoverRead']>()
      server.use(
        http.get('https://api.example.test/api/users/me', () => {
          requests += 1
          return HttpResponse.json(body, { status })
        }),
      )
      const client = createClient({ recoverRead })
      let caughtError: unknown

      try {
        await client.read({ target: '/users/me', schema: userResponseSchema })
      } catch (error: unknown) {
        caughtError = error
      }

      expect(caughtError).toBeInstanceOf(ApiError)
      expect(caughtError).toMatchObject({ failure: { kind: expectedKind, status } })
      expect(requests).toBe(1)
      expect(recoverRead).not.toHaveBeenCalled()
    },
  )

  it('maps a network failure to unavailable without automatic replay', async () => {
    let requests = 0
    const recoverRead = vi.fn<SessionRecovery['recoverRead']>()
    server.use(
      http.get('https://api.example.test/api/users/me', () => {
        requests += 1
        return HttpResponse.error()
      }),
    )
    const client = createClient({ recoverRead })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).rejects.toMatchObject({ failure: { kind: 'unavailable', status: undefined } })
    expect(requests).toBe(1)
    expect(recoverRead).not.toHaveBeenCalled()
  })

  it('turns an unrecovered 401 into a typed session outcome', async () => {
    let requests = 0
    const recoverRead = vi
      .fn<SessionRecovery['recoverRead']>()
      .mockResolvedValue('dead')
    server.use(
      http.get('https://api.example.test/api/users/me', () => {
        requests += 1
        return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
      }),
    )
    const client = createClient({ recoverRead })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toEqual({ kind: 'session', state: 'dead' })
    expect(requests).toBe(1)
    expect(recoverRead).toHaveBeenCalledTimes(1)
  })

  it('delivers sanitized 422 issues for field and general error mapping', async () => {
    const privateInput = 'private-password-value'
    const privateContext = 'private-context-value'
    server.use(
      http.get('https://api.example.test/api/users/me', () =>
        HttpResponse.json(
          {
            detail: [
              {
                type: 'value_error',
                loc: ['body', 'email'],
                msg: 'Primer error de correo',
                input: privateInput,
                ctx: { private: privateContext },
              },
              {
                type: 'unknown',
                loc: ['body', 'unknown_field'],
                msg: 'Campo desconocido',
                input: 'private-unknown-value',
              },
              {
                type: 'duplicate',
                loc: ['body', 'email'],
                msg: 'Segundo error de correo',
              },
              {
                type: 'reserved',
                loc: ['body', '__proto__'],
                msg: 'Campo reservado',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    )
    const client = createClient({
      recoverRead: () => Promise.resolve('dead'),
    })
    let caughtError: unknown

    try {
      await client.read({ target: '/users/me', schema: userResponseSchema })
    } catch (error: unknown) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(ApiError)
    if (!(caughtError instanceof ApiError)) return

    expect(caughtError.failure).toMatchObject({ kind: 'validation', status: 422 })
    expect(caughtError.failure.issues).toEqual([
      {
        type: 'value_error',
        loc: ['body', 'email'],
        msg: 'Primer error de correo',
      },
      {
        type: 'unknown',
        loc: ['body', 'unknown_field'],
        msg: 'Campo desconocido',
      },
      {
        type: 'duplicate',
        loc: ['body', 'email'],
        msg: 'Segundo error de correo',
      },
      {
        type: 'reserved',
        loc: ['body', '__proto__'],
        msg: 'Campo reservado',
      },
    ])
    expect(Object.isFrozen(caughtError.failure.issues)).toBe(true)
    expect(caughtError.failure.issues?.every((issue) => Object.isFrozen(issue))).toBe(
      true,
    )
    expect(mapValidationIssues(caughtError.failure.issues ?? [], ['email'])).toEqual({
      fields: { email: 'Primer error de correo' },
      general: ['Campo desconocido', 'Campo reservado'],
    })
    expect(caughtError).not.toHaveProperty('cause')
    expect(JSON.stringify(caughtError)).not.toContain(privateInput)
    expect(JSON.stringify(caughtError)).not.toContain(privateContext)
    expect(JSON.stringify(caughtError)).not.toContain('private-unknown-value')
  })

  it('accepts valid JSON and rejects invalid or corrupt success responses', async () => {
    let responseKind: 'valid' | 'invalid' | 'corrupt' = 'valid'
    server.use(
      http.get('https://api.example.test/api/users/me', () => {
        if (responseKind === 'valid') return HttpResponse.json(USER_RESPONSE)
        if (responseKind === 'invalid') {
          return HttpResponse.json({ ...USER_RESPONSE, cedula: 'private-value' })
        }
        return new HttpResponse('{"uuid":', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    const client = createClient({
      recoverRead: () => Promise.resolve('dead'),
    })

    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).resolves.toEqual({ kind: 'success', data: USER_RESPONSE })

    responseKind = 'invalid'
    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).rejects.toMatchObject({ reason: 'invalid-shape' })

    responseKind = 'corrupt'
    await expect(
      client.read({ target: '/users/me', schema: userResponseSchema }),
    ).rejects.toBeInstanceOf(ContractError)
  })
})
