import { queryOptions, type QueryClient } from '@tanstack/react-query'

import type { UserResponse } from '../../contracts/schemas/user'
import type { SessionFailureState } from '../../core/http/api-client'
import { parsePublicUuid, type UsersApi } from './users-api'
import { userDetailQueryKey, type UserDetailQueryKey } from './user-query-keys'

export interface UserDetailFoundOutcome {
  readonly status: 'found'
  readonly user: UserResponse
}

export interface UserDetailNotFoundOutcome {
  readonly status: 'not-found'
  readonly userUuid: string | null
}

export interface UserDetailSessionOutcome {
  readonly status: 'session'
  readonly kind: 'session'
  readonly state: SessionFailureState
}

export type UserDetailQueryOutcome =
  | UserDetailFoundOutcome
  | UserDetailNotFoundOutcome
  | UserDetailSessionOutcome

export function userDetailQueryOptions(
  usersApi: Pick<UsersApi, 'getUser'>,
  accountUuid: string,
  userUuid: string,
) {
  const parsedTarget = parsePublicUuid(userUuid)
  const normalizedTargetUuid =
    parsedTarget.kind === 'valid' ? parsedTarget.userUuid : null

  return queryOptions<
    UserDetailQueryOutcome,
    Error,
    UserDetailQueryOutcome,
    UserDetailQueryKey
  >({
    queryKey: userDetailQueryKey(accountUuid, userUuid),
    queryFn: async ({ signal }) => {
      const outcome = await usersApi.getUser({ userUuid, signal })
      if (outcome.kind === 'not-found') {
        return {
          status: 'not-found',
          userUuid: normalizedTargetUuid,
        }
      }
      if (outcome.kind === 'session') {
        return {
          status: 'session',
          kind: 'session',
          state: outcome.state,
        }
      }
      return {
        status: 'found',
        user: outcome.data,
      }
    },
    retry: false,
    retryOnMount: false,
    staleTime: 30_000,
  })
}

export function invalidateUserDetailQuery(
  queryClient: QueryClient,
  accountUuid: string,
  userUuid: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: userDetailQueryKey(accountUuid, userUuid),
    exact: true,
  })
}
