import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createApiClient, type RecoveryResult } from '../../core/http/api-client'
import { ApiError, ContractError } from '../../core/http/errors'
import { server } from '../../test/server'
import { createProfileApi } from './profile-api'

const API_BASE_URL = 'https://api.example.test/api'
const PROFILE_URL = `${API_BASE_URL}/users/me`
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const USER_RESPONSE = {
  uuid: USER_UUID,
  name: 'Ana',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: '+57 300 123 4567',
  role: 'master',
  is_active: true,
} as const

function createTestProfileApi(recovery: RecoveryResult = 'dead') {
  return createProfileApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'profile-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve(recovery) },
    }),
  })
}

describe('profile API', () => {
  it('gets the strictly validated public profile with bearer authentication', async () => {
    server.use(
      http.get(PROFILE_URL, ({ request }) => {
        expect(request.method).toBe('GET')
        expect(request.headers.get('authorization')).toBe('Bearer profile-access-value')
        expect(request.headers.has('x-csrf-token')).toBe(false)
        return HttpResponse.json(USER_RESPONSE)
      }),
    )

    await expect(createTestProfileApi().get()).resolves.toEqual({
      kind: 'success',
      data: USER_RESPONSE,
    })
  })

  it.each(['document_number', 'id', 'created_at', 'password', 'password_hash'])(
    'rejects a profile containing private property %s',
    async (property) => {
      server.use(
        http.get(PROFILE_URL, () =>
          HttpResponse.json({ ...USER_RESPONSE, [property]: 'private-value' }),
        ),
      )

      await expect(createTestProfileApi().get()).rejects.toMatchObject({
        name: 'ContractError',
        reason: 'invalid-shape',
      })
    },
  )

  it.each([
    ['invalid shape', JSON.stringify({ ...USER_RESPONSE, email: 'invalid' }), 'invalid-shape'],
    ['corrupt JSON', '{"uuid":', 'invalid-json'],
  ])('rejects an %s response', async (_case, body, reason) => {
    server.use(
      http.get(PROFILE_URL, () =>
        new HttpResponse(body, { headers: { 'Content-Type': 'application/json' } }),
      ),
    )

    await expect(createTestProfileApi().get()).rejects.toMatchObject({
      name: 'ContractError',
      reason,
    })
  })

  it('puts exactly the four normalized profile fields and validates the response', async () => {
    server.use(
      http.put(PROFILE_URL, async ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer profile-access-value')
        expect(await request.json()).toEqual({
          name: 'Ana María',
          last_name: null,
          phone_number: '+57 300 123',
          email: 'ana@example.com',
        })
        return HttpResponse.json({
          ...USER_RESPONSE,
          name: 'Ana María',
          last_name: null,
          phone_number: '+57 300 123',
        })
      }),
    )

    await expect(
      createTestProfileApi().update({
        name: ' Ana María ',
        last_name: ' ',
        phone_number: ' +57 300 123 ',
        email: ' ANA@EXAMPLE.COM ',
      }),
    ).resolves.toEqual({
      kind: 'success',
      data: {
        ...USER_RESPONSE,
        name: 'Ana María',
        last_name: null,
        phone_number: '+57 300 123',
      },
    })
  })

  it('rejects an invalid PUT response before returning profile data', async () => {
    server.use(
      http.put(PROFILE_URL, () => HttpResponse.json({ ...USER_RESPONSE, uuid: 'internal-id' })),
    )

    await expect(
      createTestProfileApi().update({
        name: 'Ana',
        last_name: null,
        phone_number: null,
        email: 'ana@example.com',
      }),
    ).rejects.toBeInstanceOf(ContractError)
  })

  it('rejects corrupt JSON from PUT before returning profile data', async () => {
    server.use(
      http.put(
        PROFILE_URL,
        () => new HttpResponse('{"uuid":', { headers: { 'Content-Type': 'application/json' } }),
      ),
    )

    await expect(
      createTestProfileApi().update({
        name: 'Ana',
        last_name: null,
        phone_number: null,
        email: 'ana@example.com',
      }),
    ).rejects.toMatchObject({ reason: 'invalid-json' })
  })

  it('propagates AbortSignal and never delivers a delayed profile', async () => {
    let requestStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve
    })
    server.use(
      http.get(PROFILE_URL, async () => {
        requestStarted?.()
        await delay('infinite')
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const controller = new AbortController()
    let delivered = false
    const pending = createTestProfileApi()
      .get(controller.signal)
      .then((outcome) => {
        delivered = true
        return outcome
      })

    await started
    controller.abort()

    await expect(pending).rejects.toMatchObject({ reason: 'cancelled' })
    expect(delivered).toBe(false)
  })

  it('returns the sanitized session outcome for an unrecoverable GET 401', async () => {
    server.use(http.get(PROFILE_URL, () => HttpResponse.json({ detail: 'secret' }, { status: 401 })))

    await expect(createTestProfileApi('dead').get()).resolves.toEqual({
      kind: 'session',
      state: 'dead',
    })
  })

  it('does not replay PUT after a recovered 401', async () => {
    let requests = 0
    server.use(
      http.put(PROFILE_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'secret' }, { status: 401 })
      }),
    )

    await expect(
      createTestProfileApi('recovered').update({
        name: 'Ana',
        last_name: null,
        phone_number: null,
        email: 'ana@example.com',
      }),
    ).resolves.toEqual({ kind: 'requires-confirmation', sensitiveInput: 'clear' })
    expect(requests).toBe(1)
  })

  it.each([
    [403, 'forbidden'],
    [409, 'conflict'],
    [503, 'unavailable'],
  ])('preserves sanitized API failure for HTTP %i', async (status, kind) => {
    server.use(
      http.put(PROFILE_URL, () =>
        HttpResponse.json({ detail: 'safe explanation', source: 'private-body' }, { status }),
      ),
    )

    const error = await createTestProfileApi()
      .update({
        name: 'Ana',
        last_name: null,
        phone_number: null,
        email: 'ana@example.com',
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ failure: { kind, status } })
    expect(JSON.stringify(error)).not.toContain('private-body')
    expect(JSON.stringify(error)).not.toContain('profile-access-value')
    expect(error).not.toHaveProperty('response')
    expect(error).not.toHaveProperty('config')
  })

  it('preserves only sanitized validation issues from a 422', async () => {
    server.use(
      http.put(PROFILE_URL, () =>
        HttpResponse.json(
          {
            detail: [
              {
                type: 'value_error',
                loc: ['body', 'email'],
                msg: 'Correo inválido',
                input: 'private-input',
                ctx: { source: 'private-source' },
              },
            ],
          },
          { status: 422 },
        ),
      ),
    )

    const error = await createTestProfileApi()
      .update({
        name: 'Ana',
        last_name: null,
        phone_number: null,
        email: 'ana@example.com',
      })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      failure: {
        kind: 'validation',
        status: 422,
        issues: [{ type: 'value_error', loc: ['body', 'email'], msg: 'Correo inválido' }],
      },
    })
    expect(JSON.stringify(error)).not.toMatch(/private-input|private-source/)
  })

  it('classifies a network error without exposing Axios internals', async () => {
    server.use(http.get(PROFILE_URL, () => HttpResponse.error()))

    const error = await createTestProfileApi()
      .get()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ failure: { kind: 'unavailable', status: undefined } })
    expect(error).not.toHaveProperty('request')
    expect(error).not.toHaveProperty('config')
  })
})
