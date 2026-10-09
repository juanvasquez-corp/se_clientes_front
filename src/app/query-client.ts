import {
  hashKey,
  MutationCache,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query'

export interface AppMutationMeta extends Record<string, unknown> {
  invalidates?: readonly QueryKey[]
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: AppMutationMeta
  }
}

export interface RemoteCacheController {
  clearForLogout: () => void
  clearForAccountChange: () => void
  clearForSessionEnd: () => void
}

export function createMutationInvalidationMeta(
  queryKeys: readonly QueryKey[],
): AppMutationMeta {
  return { invalidates: [...queryKeys] }
}

async function invalidateRelatedQueries(
  queryClient: QueryClient,
  queryKeys: readonly QueryKey[] | undefined,
): Promise<void> {
  if (queryKeys === undefined || queryKeys.length === 0) return

  const uniqueKeys = new Map<string, QueryKey>()
  for (const queryKey of queryKeys) {
    uniqueKeys.set(hashKey(queryKey), queryKey)
  }

  await Promise.all(
    [...uniqueKeys.values()].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
    mutationCache: new MutationCache({
      onSuccess: async (_data, _variables, _onMutateResult, _mutation, context) => {
        await invalidateRelatedQueries(context.client, context.meta?.invalidates)
      },
    }),
  })
}

export function createRemoteCacheController(
  queryClient: QueryClient,
): RemoteCacheController {
  return {
    clearForLogout() {
      queryClient.clear()
    },
    clearForAccountChange() {
      queryClient.clear()
    },
    clearForSessionEnd() {
      queryClient.clear()
    },
  }
}
