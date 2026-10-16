import { CancelledError, QueryClient } from '@tanstack/react-query'
import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { createApiClient } from '../../core/http/api-client'
import { ApiError } from '../../core/http/errors'
import { server } from '../../test/server'
import { createProfileApi } from './profile-api'
import { profileQueryKey, profileQueryOptions } from './profile-query'

const API_BASE_URL = 'https://api.example.test/api'
const PROFILE_URL = `${API_BASE_URL}/users/me`
const FIRST_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const SECOND_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const USER_RESPONSE = {
  uuid: FIRST_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  role: 'master',
  is_active: true,
} as const

function createQueryProfileApi() {
  return createProfileApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'query-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
    }),
  })
}

function createRetryingQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 3 } },
  })
}

describe('profile query options', () => {
  it('uses an account-scoped stable key and isolates cached profiles', async () => {
    let response: UserResponse = USER_RESPONSE
    server.use(http.get(PROFILE_URL, () => HttpResponse.json(response)))
    const queryClient = createRetryingQueryClient()
    const api = createQueryProfileApi()

    await queryClient.query(profileQueryOptions(api, FIRST_UUID))
    response = { ...USER_RESPONSE, uuid: SECOND_UUID, name: 'Bea', email: 'bea@example.com' }
    await queryClient.query(profileQueryOptions(api, SECOND_UUID))

    expect(profileQueryKey(FIRST_UUID)).toEqual(['profile', FIRST_UUID])
    expect(queryClient.getQueryData(profileQueryKey(FIRST_UUID))).toMatchObject({
      data: { uuid: FIRST_UUID, name: 'Ana' },
    })
    expect(queryClient.getQueryData(profileQueryKey(SECOND_UUID))).toMatchObject({
      data: { uuid: SECOND_UUID, name: 'Bea' },
    })
  })

  it('propagates the Query AbortSignal and stores no late profile', async () => {
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
    const queryClient = createRetryingQueryClient()
    const key = profileQueryKey(FIRST_UUID)
    const pending = queryClient.query(profileQueryOptions(createQueryProfileApi(), FIRST_UUID))

    await started
    await queryClient.cancelQueries({ queryKey: key })

    const cancellation = await pending.catch((caught: unknown) => caught)

    expect(cancellation).toBeInstanceOf(CancelledError)
    expect(queryClient.getQueryData(key)).toBeUndefined()
  })

  it.each([
    [401, 'session'],
    [403, 'forbidden'],
    [409, 'conflict'],
    [422, 'client-error'],
    [503, 'unavailable'],
  ])('never retries HTTP %i', async (status, expectedKind) => {
    let requests = 0
    server.use(
      http.get(PROFILE_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'failure' }, { status })
      }),
    )
    const queryClient = createRetryingQueryClient()

    const result = await queryClient
      .query(profileQueryOptions(createQueryProfileApi(), FIRST_UUID))
      .catch((caught: unknown) => caught)

    if (status === 401) {
      expect(result).toEqual({ kind: 'session', state: 'dead' })
    } else {
      expect(result).toBeInstanceOf(ApiError)
      expect(result).toMatchObject({ failure: { kind: expectedKind, status } })
    }
    expect(requests).toBe(1)
  })

  it('never retries a network failure', async () => {
    let requests = 0
    server.use(
      http.get(PROFILE_URL, () => {
        requests += 1
        return HttpResponse.error()
      }),
    )
    const queryClient = createRetryingQueryClient()

    await expect(
      queryClient.query(profileQueryOptions(createQueryProfileApi(), FIRST_UUID)),
    ).rejects.toMatchObject({ failure: { kind: 'unavailable' } })
    expect(requests).toBe(1)
  })
})
