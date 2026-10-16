import { CancelledError, QueryClient } from '@tanstack/react-query'
import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createApiClient, type RecoveryResult } from '../../core/http/api-client'
import { ApiError, ContractError } from '../../core/http/errors'
import { server } from '../../test/server'
import { createUsersApi } from './users-api'
import { userDetailQueryKey } from './user-query-keys'
import {
  invalidateUserDetailQuery,
  userDetailQueryOptions,
} from './user-detail-query'

const API_BASE_URL = 'https://api.example.test/api'
const USERS_URL = `${API_BASE_URL}/users`
const FIRST_ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const SECOND_ACCOUNT_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const TARGET_USER_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const UPPERCASE_TARGET_USER_UUID = '9B1DEB4D-3B7D-4BAD-9BDD-2B0D7B3DCB6D'
const USER_DETAIL_URL = `${USERS_URL}/${TARGET_USER_UUID}`

const USER_RESPONSE = {
  uuid: TARGET_USER_UUID,
  name: 'Carlos',
  last_name: null,
  email: 'carlos@example.com',
  phone_number: null,
  role: 'master',
  is_active: true,
} as const

function createQueryUsersApi(recovery: RecoveryResult = 'dead') {
  return createUsersApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'detail-query-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve(recovery) },
    }),
  })
}

function createRetryingQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: 3 } } })
}

describe('user detail query options', () => {
  it('delivers found user data and isolates cache by authenticated account and normalized target UUID', async () => {
    let name = 'Carlos'
    server.use(
      http.get(USER_DETAIL_URL, () =>
        HttpResponse.json({
          ...USER_RESPONSE,
          name,
        }),
      ),
    )
    const queryClient = createRetryingQueryClient()
    const api = createQueryUsersApi()

    const firstOutcome = await queryClient.query(
      userDetailQueryOptions(api, FIRST_ACCOUNT_UUID, UPPERCASE_TARGET_USER_UUID),
    )
    name = 'Diana'
    const secondOutcome = await queryClient.query(
      userDetailQueryOptions(api, SECOND_ACCOUNT_UUID, TARGET_USER_UUID),
    )

    expect(firstOutcome).toEqual({
      status: 'found',
      user: { ...USER_RESPONSE, name: 'Carlos' },
    })
    expect(secondOutcome).toEqual({
      status: 'found',
      user: { ...USER_RESPONSE, name: 'Diana' },
    })
    expect(
      queryClient.getQueryData(userDetailQueryKey(FIRST_ACCOUNT_UUID, TARGET_USER_UUID)),
    ).toEqual({
      status: 'found',
      user: { ...USER_RESPONSE, name: 'Carlos' },
    })
    expect(
      queryClient.getQueryData(userDetailQueryKey(SECOND_ACCOUNT_UUID, TARGET_USER_UUID)),
    ).toEqual({
      status: 'found',
      user: { ...USER_RESPONSE, name: 'Diana' },
    })
  })

  it('converts backend 404 into typed not-found state without throwing or retrying', async () => {
    let requests = 0
    server.use(
      http.get(USER_DETAIL_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'not found' }, { status: 404 })
      }),
    )
    const queryClient = createRetryingQueryClient()

    const outcome = await queryClient.query(
      userDetailQueryOptions(
        createQueryUsersApi(),
        FIRST_ACCOUNT_UUID,
        UPPERCASE_TARGET_USER_UUID,
      ),
    )

    expect(outcome).toEqual({
      status: 'not-found',
      userUuid: TARGET_USER_UUID,
    })
    expect(requests).toBe(1)
  })

  it.each([
    ['empty string', ''],
    ['numeric document_number', '1023456789'],
    ['path traversal', '../me'],
    ['non-uuid', 'not-a-uuid'],
  ])('converts invalid target %s into typed not-found with 0 HTTP requests and no leaked identifier', async (_label, invalidTarget) => {
    let requests = 0
    server.use(
      http.get(`${USERS_URL}/*`, () => {
        requests += 1
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const queryClient = createRetryingQueryClient()

    const outcome = await queryClient.query(
      userDetailQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, invalidTarget),
    )

    expect(outcome).toEqual({
      status: 'not-found',
      userUuid: null,
    })
    expect(requests).toBe(0)
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.queryKey))).not.toContain(
      '1023456789',
    )
  })

  it('passes the TanStack Query AbortSignal to getUser and stores no delayed result after cancellation', async () => {
    let startedRequest: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      startedRequest = resolve
    })
    server.use(
      http.get(USER_DETAIL_URL, async () => {
        startedRequest?.()
        await delay('infinite')
        return HttpResponse.json(USER_RESPONSE)
      }),
    )
    const queryClient = createRetryingQueryClient()
    const key = userDetailQueryKey(FIRST_ACCOUNT_UUID, TARGET_USER_UUID)
    const pending = queryClient.query(
      userDetailQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, TARGET_USER_UUID),
    )

    await started
    await queryClient.cancelQueries({ queryKey: key, exact: true })

    await expect(pending).rejects.toBeInstanceOf(CancelledError)
    expect(queryClient.getQueryData(key)).toBeUndefined()
  })

  it.each([
    [403, 'forbidden'],
    [503, 'unavailable'],
  ] as const)('never retries HTTP %i and propagates sanitized ApiError', async (status, failureKind) => {
    let requests = 0
    server.use(
      http.get(USER_DETAIL_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'failure' }, { status })
      }),
    )

    const error = await createRetryingQueryClient()
      .query(
        userDetailQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, TARGET_USER_UUID),
      )
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ failure: { kind: failureKind, status } })
    expect(requests).toBe(1)
  })

  it('never retries a network failure and propagates sanitized unavailable error', async () => {
    let requests = 0
    server.use(
      http.get(USER_DETAIL_URL, () => {
        requests += 1
        return HttpResponse.error()
      }),
    )

    await expect(
      createRetryingQueryClient().query(
        userDetailQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, TARGET_USER_UUID),
      ),
    ).rejects.toMatchObject({ failure: { kind: 'unavailable' } })
    expect(requests).toBe(1)
  })

  it('never retries a contract failure when response includes prohibited fields', async () => {
    let requests = 0
    server.use(
      http.get(USER_DETAIL_URL, () => {
        requests += 1
        return HttpResponse.json({ ...USER_RESPONSE, document_number: '1023456789' })
      }),
    )

    const error = await createRetryingQueryClient()
      .query(
        userDetailQueryOptions(createQueryUsersApi(), FIRST_ACCOUNT_UUID, TARGET_USER_UUID),
      )
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ContractError)
    expect(requests).toBe(1)
  })

  it('never retries a 401 session outcome', async () => {
    let requests = 0
    server.use(
      http.get(USER_DETAIL_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
      }),
    )

    await expect(
      createRetryingQueryClient().query(
        userDetailQueryOptions(createQueryUsersApi('dead'), FIRST_ACCOUNT_UUID, TARGET_USER_UUID),
      ),
    ).resolves.toMatchObject({
      status: 'session',
      kind: 'session',
      state: 'dead',
    })
    expect(requests).toBe(1)
  })

  it('invalidates only the target user detail entry for the active account', async () => {
    server.use(http.get(`${USERS_URL}/*`, () => HttpResponse.json(USER_RESPONSE)))
    const queryClient = createRetryingQueryClient()
    const api = createQueryUsersApi()

    await queryClient.query(
      userDetailQueryOptions(api, FIRST_ACCOUNT_UUID, TARGET_USER_UUID),
    )
    await queryClient.query(
      userDetailQueryOptions(api, SECOND_ACCOUNT_UUID, TARGET_USER_UUID),
    )

    await invalidateUserDetailQuery(
      queryClient,
      FIRST_ACCOUNT_UUID,
      UPPERCASE_TARGET_USER_UUID,
    )

    expect(
      queryClient.getQueryState(
        userDetailQueryKey(FIRST_ACCOUNT_UUID, TARGET_USER_UUID),
      )?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(
        userDetailQueryKey(SECOND_ACCOUNT_UUID, TARGET_USER_UUID),
      )?.isInvalidated,
    ).toBe(false)
  })
})
