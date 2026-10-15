import { z } from 'zod'

import {
  paginatedUserResponseSchema,
  userResponseSchema,
  userUuidSchema,
  type PaginatedUserResponse,
  type UserResponse,
} from '../../contracts/schemas/user'
import type {
  ApiClient,
  MutationOutcome,
  ReadOutcome,
} from '../../core/http/api-client'
import { ApiError } from '../../core/http/errors'

const USERS_TARGET = '/users'
const SEARCH_TARGET = '/users/search'
const SEARCH_KEYS = ['email'] as const
const MAX_PAGE = 100_000
const MAX_PAGE_SIZE = 50
const publicUserSchema = userResponseSchema

const searchRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
})

export interface UserPageParams {
  readonly page: number
  readonly size: number
}

export interface SearchNotFoundOutcome {
  readonly kind: 'not-found'
}

export type UserNotFoundOutcome = SearchNotFoundOutcome

export interface ValidPublicUuidOutcome {
  readonly kind: 'valid'
  readonly userUuid: string
}

export type PublicUuidParseResult =
  | ValidPublicUuidOutcome
  | UserNotFoundOutcome

export interface GetUserParams {
  readonly userUuid: unknown
  readonly signal?: AbortSignal
}

export type SearchUsersOutcome =
  | MutationOutcome<UserResponse>
  | SearchNotFoundOutcome

export type GetUserOutcome =
  | ReadOutcome<UserResponse>
  | UserNotFoundOutcome

export interface UsersApiConfig {
  readonly apiClient: Pick<ApiClient, 'read' | 'mutate'>
}

export interface UsersApi {
  readonly list: (
    params: UserPageParams,
    signal?: AbortSignal,
  ) => Promise<ReadOutcome<PaginatedUserResponse>>
  readonly search: (
    email: string,
    signal?: AbortSignal,
  ) => Promise<SearchUsersOutcome>
  readonly getUser: (
    params: GetUserParams | string,
    signal?: AbortSignal,
  ) => Promise<GetUserOutcome>
}

export function normalizePage(page: number): number {
  if (!Number.isSafeInteger(page) || page < 1) return 1
  return Math.min(MAX_PAGE, page)
}

export function normalizePageSize(size: number): number {
  if (!Number.isSafeInteger(size) || size < 1) return 1
  return Math.min(MAX_PAGE_SIZE, size)
}

export function normalizeSearchEmail(email: string): string {
  return searchRequestSchema.parse({ email }).email
}

export function parsePublicUuid(input: unknown): PublicUuidParseResult {
  if (typeof input !== 'string') return { kind: 'not-found' }
  const result = userUuidSchema.safeParse(input.toLowerCase())
  return result.success
    ? { kind: 'valid', userUuid: result.data }
    : { kind: 'not-found' }
}

function isUserNotFound(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.failure.status === 404 &&
    error.failure.kind === 'not-found'
  )
}

function resolveGetUserParams(
  params: GetUserParams | string,
  signal?: AbortSignal,
): GetUserParams {
  if (typeof params !== 'string') {
    return {
      userUuid: params.userUuid,
      signal: params.signal ?? signal,
    }
  }
  return { userUuid: params, signal }
}

export function createUsersApi(config: UsersApiConfig): UsersApi {
  return {
    list({ page, size }, signal) {
      const normalizedPage = normalizePage(page)
      const normalizedSize = normalizePageSize(size)
      return config.apiClient.read({
        target: `${USERS_TARGET}?page=${String(normalizedPage)}&size=${String(normalizedSize)}`,
        schema: paginatedUserResponseSchema,
        signal,
      })
    },
    async search(email, signal) {
      const source = { email: normalizeSearchEmail(email) }

      try {
        return await config.apiClient.mutate({
          method: 'POST',
          target: SEARCH_TARGET,
          source,
          allowedKeys: SEARCH_KEYS,
          schema: userResponseSchema,
          signal,
        })
      } catch (error: unknown) {
        if (isUserNotFound(error)) return { kind: 'not-found' }
        throw error
      }
    },
    async getUser(params, signal) {
      const resolved = resolveGetUserParams(params, signal)
      const parsedUuid = parsePublicUuid(resolved.userUuid)
      if (parsedUuid.kind === 'not-found') {
        return { kind: 'not-found' }
      }

      try {
        return await config.apiClient.read({
          target: `${USERS_TARGET}/${parsedUuid.userUuid}`,
          schema: publicUserSchema,
          signal: resolved.signal,
        })
      } catch (error: unknown) {
        if (isUserNotFound(error)) return { kind: 'not-found' }
        throw error
      }
    },
  }
}
