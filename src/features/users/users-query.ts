import {
  QueryObserver,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query'

import {
  changeDirectoryPage,
  clearDirectorySearch,
  createListDirectoryState,
  submitDirectorySearch,
  type DirectoryState,
} from './directory-mode'
import { userDirectoryQueryKey } from './user-query-keys'
import type { UserPageParams, UsersApi } from './users-api'

export type UsersDirectoryQueryOutcome =
  | Awaited<ReturnType<UsersApi['list']>>
  | Awaited<ReturnType<UsersApi['search']>>

export function usersDirectoryQueryOptions(
  usersApi: Pick<UsersApi, 'list' | 'search'>,
  accountUuid: string,
  state: DirectoryState,
) {
  return queryOptions<
    UsersDirectoryQueryOutcome,
    Error,
    UsersDirectoryQueryOutcome,
    ReturnType<typeof userDirectoryQueryKey>
  >({
    queryKey: userDirectoryQueryKey(accountUuid, state),
    queryFn: async ({ signal }) =>
      state.kind === 'list'
        ? await usersApi.list({ page: state.page, size: state.size }, signal)
        : await usersApi.search(state.email, signal),
    retry: false,
    retryOnMount: false,
    staleTime: 30_000,
  })
}

export interface DirectoryQueryControllerConfig {
  readonly queryClient: QueryClient
  readonly accountUuid: string
  readonly initial: UserPageParams
}

export interface DirectoryQueryController {
  readonly getState: () => DirectoryState
  readonly submitSearch: (email: string) => Promise<DirectoryState>
  readonly clearSearch: () => Promise<DirectoryState>
  readonly changePage: (page: number) => Promise<DirectoryState>
}

interface RetainedInitialQuery {
  release: () => void
  claims: number
  releaseGeneration: number
}

const retainedInitialQueries = new WeakMap<
  QueryClient,
  Map<string, RetainedInitialQuery>
>()

export function retainInitialUsersDirectoryQuery({
  abortSignal,
  accountUuid,
  queryClient,
  usersApi,
}: {
  readonly abortSignal: AbortSignal
  readonly accountUuid: string
  readonly queryClient: QueryClient
  readonly usersApi: Pick<UsersApi, 'list' | 'search'>
}): void {
  if (abortSignal.aborted) return

  let retainedByAccount = retainedInitialQueries.get(queryClient)
  if (retainedByAccount === undefined) {
    retainedByAccount = new Map()
    retainedInitialQueries.set(queryClient, retainedByAccount)
  }
  if (retainedByAccount.has(accountUuid)) return

  const initialMode = createListDirectoryState({ page: 1, size: 10 })
  const observer = new QueryObserver(
    queryClient,
    usersDirectoryQueryOptions(usersApi, accountUuid, initialMode),
  )
  const unsubscribe = observer.subscribe(() => undefined)
  let released = false
  const retained: RetainedInitialQuery = {
    claims: 0,
    releaseGeneration: 0,
    release: () => undefined,
  }
  const release = () => {
    if (released) return
    released = true
    abortSignal.removeEventListener('abort', release)
    unsubscribe()
    if (retainedByAccount.get(accountUuid) === retained) {
      retainedByAccount.delete(accountUuid)
    }
    void queryClient.cancelQueries({
      queryKey: userDirectoryQueryKey(accountUuid, initialMode),
      exact: true,
    })
  }
  retained.release = release

  retainedByAccount.set(accountUuid, retained)
  abortSignal.addEventListener('abort', release, { once: true })
}

export function claimInitialUsersDirectoryQuery(
  queryClient: QueryClient,
  accountUuid: string,
): () => void {
  const retained = retainedInitialQueries.get(queryClient)?.get(accountUuid)
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

export function createDirectoryQueryController(
  config: DirectoryQueryControllerConfig,
): DirectoryQueryController {
  let state: DirectoryState = createListDirectoryState(config.initial)

  const replaceState = async (nextState: DirectoryState): Promise<DirectoryState> => {
    const previousKey = userDirectoryQueryKey(config.accountUuid, state)
    state = nextState
    await config.queryClient.cancelQueries({ queryKey: previousKey, exact: true })
    return state
  }

  return {
    getState: () => state,
    submitSearch(email) {
      return replaceState(submitDirectorySearch(state, email))
    },
    clearSearch() {
      return replaceState(clearDirectorySearch(state))
    },
    changePage(page) {
      return replaceState(changeDirectoryPage(state, page))
    },
  }
}
