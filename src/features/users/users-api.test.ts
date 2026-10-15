import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createApiClient, type RecoveryResult } from '../../core/http/api-client'
import { ApiError, ContractError } from '../../core/http/errors'
import { server } from '../../test/server'
import { createUsersApi } from './users-api'

const API_BASE_URL = 'https://api.example.test/api'
const USERS_URL = `${API_BASE_URL}/users`
const SEARCH_URL = `${USERS_URL}/search`
const USER_RESPONSE = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: '+57 300 123 4567',
  rol: 'master',
  is_active: true,
} as const
const PAGE_RESPONSE = {
  total_records: 51,
  current_page: 2,
  total_pages: 3,
  page_size: 20,
  data: [USER_RESPONSE],
} as const

function createTestUsersApi(recovery: RecoveryResult = 'dead') {
  return createUsersApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'directory-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve(recovery) },
    }),
  })
}

describe('users API', () => {
  it('lists one normalized page through the exact supported query params', async () => {
    server.use(
      http.get(USERS_URL, ({ request }) => {
        const url = new URL(request.url)
        expect(request.method).toBe('GET')
        expect(url.search).toBe('?page=2&size=20')
        expect([...url.searchParams.keys()]).toEqual(['page', 'size'])
        return HttpResponse.json(PAGE_RESPONSE)
      }),
    )

    await expect(createTestUsersApi().list({ page: 2, size: 20 })).resolves.toEqual({
      kind: 'success',
      data: PAGE_RESPONSE,
    })
  })

  it.each([
    [{ page: -8, size: 0 }, '?page=1&size=1'],
    [{ page: 2.9, size: 20.8 }, '?page=1&size=1'],
    [{ page: Number.NaN, size: Number.POSITIVE_INFINITY }, '?page=1&size=1'],
    [{ page: 100_001, size: 51 }, '?page=100000&size=50'],
  ])('keeps list params inside backend boundaries for %o', async (params, query) => {
    server.use(
      http.get(USERS_URL, ({ request }) => {
        expect(new URL(request.url).search).toBe(query)
        return HttpResponse.json({
          ...PAGE_RESPONSE,
          current_page: Number(new URL(request.url).searchParams.get('page')),
          page_size: Number(new URL(request.url).searchParams.get('size')),
        })
      }),
    )

    await expect(createTestUsersApi().list(params)).resolves.toMatchObject({ kind: 'success' })
  })

  it.each([
    ['extra page field', { ...PAGE_RESPONSE, sort: 'name' }],
    ['invalid metadata', { ...PAGE_RESPONSE, page_size: 51 }],
    ['invalid public user', { ...PAGE_RESPONSE, data: [{ ...USER_RESPONSE, email: 'invalid' }] }],
    ['private user field', { ...PAGE_RESPONSE, data: [{ ...USER_RESPONSE, cedula: 'private' }] }],
  ])('rejects a paginated response with %s', async (_case, response) => {
    server.use(http.get(USERS_URL, () => HttpResponse.json(response)))

    await expect(createTestUsersApi().list({ page: 2, size: 20 })).rejects.toMatchObject({
      name: 'ContractError',
      reason: 'invalid-shape',
    })
  })

  it('rejects corrupt JSON from list', async () => {
    server.use(
      http.get(
        USERS_URL,
        () => new HttpResponse('{"data":', { headers: { 'Content-Type': 'application/json' } }),
      ),
    )

    await expect(createTestUsersApi().list({ page: 1, size: 10 })).rejects.toMatchObject({
      name: 'ContractError',
      reason: 'invalid-json',
    })
  })

  it('searches by normalized exact email in an exact JSON body', async () => {
    server.use(
      http.post(SEARCH_URL, async ({ request }) => {
        expect(new URL(request.url).search).toBe('')
        expect(request.headers.get('content-type')).toContain('application/json')
        expect(await request.json()).toEqual({ email: 'ana@example.com' })
        return HttpResponse.json(USER_RESPONSE)
      }),
    )

    await expect(createTestUsersApi().search('  ANA@EXAMPLE.COM ')).resolves.toEqual({
      kind: 'success',
      data: USER_RESPONSE,
    })
  })

  it.each([
    ['extra public field', { ...USER_RESPONSE, id: 17 }],
    ['invalid public field', { ...USER_RESPONSE, rol: 'admin' }],
  ])('rejects a search response with %s', async (_case, response) => {
    server.use(http.post(SEARCH_URL, () => HttpResponse.json(response)))

    await expect(createTestUsersApi().search('ana@example.com')).rejects.toBeInstanceOf(
      ContractError,
    )
  })

  it('rejects corrupt JSON from search', async () => {
    server.use(
      http.post(
        SEARCH_URL,
        () => new HttpResponse('{"uuid":', { headers: { 'Content-Type': 'application/json' } }),
      ),
    )

    await expect(createTestUsersApi().search('ana@example.com')).rejects.toMatchObject({
      reason: 'invalid-json',
    })
  })

  it('specializes a valid search 404 as a no-result outcome', async () => {
    server.use(
      http.post(SEARCH_URL, () => HttpResponse.json({ detail: 'Usuario no encontrado' }, { status: 404 })),
    )

    await expect(createTestUsersApi().search('missing@example.com')).resolves.toEqual({
      kind: 'not-found',
    })
  })

  it('does not specialize a malformed search 404', async () => {
    server.use(
      http.post(SEARCH_URL, () =>
        HttpResponse.json({ detail: 'Usuario no encontrado', private: true }, { status: 404 }),
      ),
    )

    const error = await createTestUsersApi().search('missing@example.com').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ failure: { kind: 'client-error', status: 404 } })
  })

  it.each([
    [400, 'bad-request'],
    [403, 'forbidden'],
    [409, 'conflict'],
    [422, 'validation'],
    [503, 'unavailable'],
  ])('preserves the sanitized transversal search failure for HTTP %i', async (status, kind) => {
    const body = status === 422
      ? { detail: [{ type: 'value_error', loc: ['body', 'email'], msg: 'Inválido' }] }
      : { detail: 'safe' }
    server.use(http.post(SEARCH_URL, () => HttpResponse.json(body, { status })))

    const error = await createTestUsersApi().search('ana@example.com').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ failure: { kind, status } })
  })

  it('preserves the sanitized search session outcome for 401', async () => {
    server.use(http.post(SEARCH_URL, () => HttpResponse.json({ detail: 'private' }, { status: 401 })))

    await expect(createTestUsersApi().search('ana@example.com')).resolves.toEqual({
      kind: 'session',
      state: 'dead',
    })
  })

  it('preserves a sanitized network failure from search', async () => {
    server.use(http.post(SEARCH_URL, () => HttpResponse.error()))

    const error = await createTestUsersApi().search('ana@example.com').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ failure: { kind: 'unavailable', status: undefined } })
    expect(error).not.toHaveProperty('request')
    expect(error).not.toHaveProperty('config')
  })

  it.each(['list', 'search'] as const)('propagates AbortSignal through %s', async (operation) => {
    let requestStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve
    })
    const handler = async () => {
      requestStarted?.()
      await delay('infinite')
      return HttpResponse.json(operation === 'list' ? PAGE_RESPONSE : USER_RESPONSE)
    }
    server.use(operation === 'list' ? http.get(USERS_URL, handler) : http.post(SEARCH_URL, handler))
    const controller = new AbortController()
    const api = createTestUsersApi()
    const pending = operation === 'list'
      ? api.list({ page: 1, size: 10 }, controller.signal)
      : api.search('ana@example.com', controller.signal)

    await started
    controller.abort()

    await expect(pending).rejects.toMatchObject({ reason: 'cancelled' })
  })
})
