import { CancelledError, QueryClient } from '@tanstack/react-query'
import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createApiClient, type RecoveryResult } from '../../core/http/api-client'
import { ApiError } from '../../core/http/errors'
import { server } from '../../test/server'
import { createListDirectoryState } from './directory-mode'
import { createUsersApi } from './users-api'
import { userDirectoryQueryKey } from './user-query-keys'
import {
  createDirectoryQueryController,
  usersDirectoryQueryOptions,
} from './users-query'

const API_BASE_URL = 'https://api.example.test/api'
const USERS_URL = `${API_BASE_URL}/users`
const SEARCH_URL = `${USERS_URL}/search`
const FIRST_ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const SECOND_ACCOUNT_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const USER_RESPONSE = {
  uuid: 'f1533379-cfe1-4fb0-936a-1f2a95e52f9b',
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  role: 'master',
  is_active: true,
} as const

function pageResponse(page: number, size = 10) {
  return {
    total_records: 21,
    current_page: page,
    total_pages: 3,
    page_size: size,
    data: [USER_RESPONSE],
  }
}

function createQueryUsersApi(recovery: RecoveryResult = 'dead') {
  return createUsersApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'directory-query-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve(recovery) },
    }),
  })
}

function createRetryingQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: 3 } } })
}

describe('users directory query options', () => {
  it('isolates cached pages for two authenticated accounts', async () => {
    let name = 'Ana'
    server.use(
      http.get(USERS_URL, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json({
          ...pageResponse(page),
          data: [{ ...USER_RESPONSE, name }],
        })
      }),
    )
    const queryClient = createRetryingQueryClient()
    const api = createQueryUsersApi()
    const mode = createListDirectoryState({ page: 2, size: 10 })

    await queryClient.query(usersDirectoryQueryOptions(api, FIRST_ACCOUNT_UUID, mode))
    name = 'Bea'
    await queryClient.query(usersDirectoryQueryOptions(api, SECOND_ACCOUNT_UUID, mode))

    expect(queryClient.getQueryData(userDirectoryQueryKey(FIRST_ACCOUNT_UUID, mode))).toMatchObject({
      data: { data: [{ name: 'Ana' }] },
    })
    expect(queryClient.getQueryData(userDirectoryQueryKey(SECOND_ACCOUNT_UUID, mode))).toMatchObject({
      data: { data: [{ name: 'Bea' }] },
    })
  })

  it('passes the query signal through list and stores no delayed result after cancellation', async () => {
    let startedRequest: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      startedRequest = resolve
    })
    server.use(
      http.get(USERS_URL, async () => {
        startedRequest?.()
        await delay('infinite')
        return HttpResponse.json(pageResponse(1))
      }),
    )
    const queryClient = createRetryingQueryClient()
    const mode = createListDirectoryState({ page: 1, size: 10 })
    const key = userDirectoryQueryKey(FIRST_ACCOUNT_UUID, mode)
    const pending = queryClient.query(
      usersDirectoryQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, mode),
    )

    await started
    await queryClient.cancelQueries({ queryKey: key, exact: true })

    await expect(pending).rejects.toBeInstanceOf(CancelledError)
    expect(queryClient.getQueryData(key)).toBeUndefined()
  })

  it('returns search 404 as typed data and never retries it', async () => {
    let requests = 0
    server.use(
      http.post(SEARCH_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'No encontrado' }, { status: 404 })
      }),
    )
    const queryClient = createRetryingQueryClient()
    const mode = {
      kind: 'search',
      email: 'missing@example.com',
      preservedPage: 2,
      size: 10,
    } as const

    await expect(
      queryClient.query(usersDirectoryQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, mode)),
    ).resolves.toEqual({ kind: 'not-found' })
    expect(requests).toBe(1)
  })

  it.each([
    ['list', 403, 'forbidden'],
    ['list', 404, 'not-found'],
    ['list', 409, 'conflict'],
    ['list', 422, 'client-error'],
    ['list', 503, 'unavailable'],
    ['search', 400, 'bad-request'],
    ['search', 403, 'forbidden'],
    ['search', 409, 'conflict'],
    ['search', 422, 'validation'],
    ['search', 503, 'unavailable'],
  ] as const)('never retries %s HTTP %i', async (kind, status, failureKind) => {
    let requests = 0
    const body = status === 422 && kind === 'search'
      ? { detail: [{ type: 'value_error', loc: ['body', 'email'], msg: 'Inválido' }] }
      : { detail: 'failure' }
    const handler = () => {
      requests += 1
      return HttpResponse.json(body, { status })
    }
    server.use(kind === 'list' ? http.get(USERS_URL, handler) : http.post(SEARCH_URL, handler))
    const mode = kind === 'list'
      ? createListDirectoryState({ page: 1, size: 10 })
      : ({
          kind: 'search',
          email: 'ana@example.com',
          preservedPage: 1,
          size: 10,
        } as const)

    const error = await createRetryingQueryClient()
      .query(usersDirectoryQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, mode))
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ failure: { kind: failureKind, status } })
    expect(requests).toBe(1)
  })

  it.each(['list', 'search'] as const)('never retries a %s 401 session outcome', async (kind) => {
    let requests = 0
    const handler = () => {
      requests += 1
      return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
    }
    server.use(kind === 'list' ? http.get(USERS_URL, handler) : http.post(SEARCH_URL, handler))
    const mode = kind === 'list'
      ? createListDirectoryState({ page: 1, size: 10 })
      : ({
          kind: 'search',
          email: 'ana@example.com',
          preservedPage: 1,
          size: 10,
        } as const)

    await expect(
      createRetryingQueryClient().query(
        usersDirectoryQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, mode),
      ),
    ).resolves.toEqual({ kind: 'session', state: 'dead' })
    expect(requests).toBe(1)
  })

  it.each(['list', 'search'] as const)('never retries a %s network failure', async (kind) => {
    let requests = 0
    const handler = () => {
      requests += 1
      return HttpResponse.error()
    }
    server.use(kind === 'list' ? http.get(USERS_URL, handler) : http.post(SEARCH_URL, handler))
    const mode = kind === 'list'
      ? createListDirectoryState({ page: 1, size: 10 })
      : ({
          kind: 'search',
          email: 'ana@example.com',
          preservedPage: 1,
          size: 10,
        } as const)

    await expect(
      createRetryingQueryClient().query(
        usersDirectoryQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, mode),
      ),
    ).rejects.toMatchObject({ failure: { kind: 'unavailable' } })
    expect(requests).toBe(1)
  })
})

describe('directory query controller', () => {
  it('cancels list when search replaces it and clear restores the preserved page', async () => {
    let listStartedRequest: (() => void) | undefined
    const listStarted = new Promise<void>((resolve) => {
      listStartedRequest = resolve
    })
    server.use(
      http.get(USERS_URL, async () => {
        listStartedRequest?.()
        await delay('infinite')
        return HttpResponse.json(pageResponse(3))
      }),
      http.post(SEARCH_URL, () => HttpResponse.json(USER_RESPONSE)),
    )
    const queryClient = createRetryingQueryClient()
    const api = createQueryUsersApi()
    const controller = createDirectoryQueryController({
      queryClient,
      accountUuid: FIRST_ACCOUNT_UUID,
      initial: { page: 3, size: 10 },
    })
    const listMode = controller.getState()
    const pendingList = queryClient.query(
      usersDirectoryQueryOptions(api, FIRST_ACCOUNT_UUID, listMode),
    )

    await listStarted
    const searchMode = await controller.submitSearch(' ANA@EXAMPLE.COM ')
    await expect(pendingList).rejects.toBeInstanceOf(CancelledError)
    await expect(
      queryClient.query(usersDirectoryQueryOptions(api, FIRST_ACCOUNT_UUID, searchMode)),
    ).resolves.toMatchObject({ kind: 'success', data: { email: 'ana@example.com' } })

    const restored = await controller.clearSearch()
    expect(restored).toEqual({ kind: 'list', page: 3, size: 10 })
  })

  it('cancels an active list when changing page', async () => {
    let requestStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve
    })
    server.use(
      http.get(USERS_URL, async () => {
        requestStarted?.()
        await delay('infinite')
        return HttpResponse.json(pageResponse(1))
      }),
    )
    const queryClient = createRetryingQueryClient()
    const api = createQueryUsersApi()
    const controller = createDirectoryQueryController({
      queryClient,
      accountUuid: FIRST_ACCOUNT_UUID,
      initial: { page: 1, size: 10 },
    })
    const pending = queryClient.query(
      usersDirectoryQueryOptions(api, FIRST_ACCOUNT_UUID, controller.getState()),
    )

    await started
    const current = await controller.changePage(2)

    await expect(pending).rejects.toBeInstanceOf(CancelledError)
    expect(current).toEqual({ kind: 'list', page: 2, size: 10 })
  })

  it('keeps the most recent simultaneous interaction and discards earlier responses', async () => {
    let listStartedRequest: (() => void) | undefined
    let searchStartedRequest: (() => void) | undefined
    const listStarted = new Promise<void>((resolve) => {
      listStartedRequest = resolve
    })
    const searchStarted = new Promise<void>((resolve) => {
      searchStartedRequest = resolve
    })
    server.use(
      http.get(USERS_URL, async () => {
        listStartedRequest?.()
        await delay('infinite')
        return HttpResponse.json(pageResponse(2))
      }),
      http.post(SEARCH_URL, async () => {
        searchStartedRequest?.()
        await delay('infinite')
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const queryClient = createRetryingQueryClient()
    const api = createQueryUsersApi()
    const controller = createDirectoryQueryController({
      queryClient,
      accountUuid: FIRST_ACCOUNT_UUID,
      initial: { page: 2, size: 10 },
    })
    const initialMode = controller.getState()
    const pendingList = queryClient.query(
      usersDirectoryQueryOptions(api, FIRST_ACCOUNT_UUID, initialMode),
    )

    await listStarted
    const searchMode = await controller.submitSearch('ana@example.com')
    const pendingSearch = queryClient.query(
      usersDirectoryQueryOptions(api, FIRST_ACCOUNT_UUID, searchMode),
    )
    await searchStarted
    const firstTransition = controller.clearSearch()
    const secondTransition = controller.changePage(5)
    await Promise.all([firstTransition, secondTransition])

    await expect(pendingList).rejects.toBeInstanceOf(CancelledError)
    await expect(pendingSearch).rejects.toBeInstanceOf(CancelledError)
    expect(controller.getState()).toEqual({ kind: 'list', page: 5, size: 10 })
    expect(queryClient.getQueryData(userDirectoryQueryKey(FIRST_ACCOUNT_UUID, searchMode))).toBeUndefined()
  })
})
