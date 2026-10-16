import {
  QueryObserver,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query'

import {
  createMutationInvalidationMeta,
  type AppMutationMeta,
} from '../../app/query-client'
import {
  userResponseSchema,
  type UserResponse,
} from '../../contracts/schemas/user'
import type { SessionFailureState } from '../../core/http/api-client'
import { parsePublicUuid, type UsersApi } from './users-api'
import {
  userDetailQueryKey,
  userDirectoryQueryRoot,
  type UserDetailQueryKey,
} from './user-query-keys'

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

interface RetainedDetailQuery {
  release: () => void
  claims: number
  releaseGeneration: number
}

const retainedDetailQueries = new WeakMap<
  QueryClient,
  Map<string, RetainedDetailQuery>
>()

function retentionMapKey(accountUuid: string, userUuid: string): string {
  return JSON.stringify(userDetailQueryKey(accountUuid, userUuid))
}

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

export function retainUserDetailQuery({
  abortSignal,
  accountUuid,
  queryClient,
  userUuid,
  usersApi,
}: {
  readonly abortSignal?: AbortSignal
  readonly accountUuid: string
  readonly queryClient: QueryClient
  readonly userUuid: string
  readonly usersApi: Pick<UsersApi, 'getUser'>
}): void {
  if (abortSignal?.aborted === true) return

  let retainedByKey = retainedDetailQueries.get(queryClient)
  if (retainedByKey === undefined) {
    retainedByKey = new Map()
    retainedDetailQueries.set(queryClient, retainedByKey)
  }

  const key = retentionMapKey(accountUuid, userUuid)
  if (retainedByKey.has(key)) return

  const options = userDetailQueryOptions(usersApi, accountUuid, userUuid)
  const observer = new QueryObserver(queryClient, options)
  const unsubscribe = observer.subscribe(() => undefined)
  let released = false
  const retained: RetainedDetailQuery = {
    claims: 0,
    releaseGeneration: 0,
    release: () => undefined,
  }
  const release = () => {
    if (released) return
    released = true
    abortSignal?.removeEventListener('abort', release)
    unsubscribe()
    if (retainedByKey.get(key) === retained) {
      retainedByKey.delete(key)
    }
    void queryClient.cancelQueries({
      queryKey: options.queryKey,
      exact: true,
    })
  }
  retained.release = release
  retainedByKey.set(key, retained)
  abortSignal?.addEventListener('abort', release, { once: true })
}

export function claimUserDetailQuery({
  accountUuid,
  queryClient,
  userUuid,
}: {
  readonly accountUuid: string
  readonly queryClient: QueryClient
  readonly userUuid: string
}): () => void {
  const key = retentionMapKey(accountUuid, userUuid)
  const retained = retainedDetailQueries.get(queryClient)?.get(key)
  if (retained === undefined) return () => undefined

  retained.claims += 1
  retained.releaseGeneration += 1
  let claimed = true

  return () => {
    if (!claimed) return
    claimed = false
    retained.claims -= 1
    const releaseGeneration = ++retained.releaseGeneration
    queueMicrotask(() => {
      if (
        retained.claims === 0 &&
        retained.releaseGeneration === releaseGeneration
      ) {
        retained.release()
      }
    })
  }
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

export function createUserDetailMutationInvalidationMeta(
  accountUuid: string,
  userUuid: string,
): AppMutationMeta {
  return createMutationInvalidationMeta([
    userDetailQueryKey(accountUuid, userUuid),
    userDirectoryQueryRoot(accountUuid),
  ])
}

export async function syncConfirmedUserDetail({
  accountUuid,
  queryClient,
  user,
}: {
  readonly accountUuid: string
  readonly queryClient: QueryClient
  readonly user: unknown
}): Promise<UserResponse | null> {
  const parsedAccount = parsePublicUuid(accountUuid)
  if (parsedAccount.kind === 'not-found') return null

  const parsedUser = userResponseSchema.safeParse(user)
  if (!parsedUser.success) return null

  const parsedTarget = parsePublicUuid(parsedUser.data.uuid)
  if (parsedTarget.kind === 'not-found') return null

  const confirmedUser: UserResponse = {
    ...parsedUser.data,
    uuid: parsedTarget.userUuid,
  }
  const detailKey = userDetailQueryKey(
    parsedAccount.userUuid,
    confirmedUser.uuid,
  )
  const directoryRootKey = userDirectoryQueryRoot(parsedAccount.userUuid)

  queryClient.setQueryData<UserDetailFoundOutcome>(detailKey, {
    status: 'found',
    user: confirmedUser,
  })
  await queryClient.invalidateQueries({ queryKey: directoryRootKey })

  return confirmedUser
}
