import { describe, expect, it, vi } from 'vitest'

import {
  createAppQueryClient,
  createMutationInvalidationMeta,
  createRemoteCacheController,
} from './query-client'

describe('mutation invalidation policy', () => {
  it('invalidates each related query once after success and preserves consumer onSuccess', async () => {
    const queryClient = createAppQueryClient()
    const relatedKey = ['test', 'account-a', 'profile'] as const
    const unrelatedKey = ['test', 'account-a', 'settings'] as const
    queryClient.setQueryData(relatedKey, { name: 'before' })
    queryClient.setQueryData(unrelatedKey, { theme: 'light' })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const consumerOnSuccess = vi.fn(() => {
      expect(queryClient.getQueryState(relatedKey)?.isInvalidated).toBe(true)
    })
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.resolve({ name: 'after' }),
      meta: createMutationInvalidationMeta([relatedKey, relatedKey]),
      onSuccess: consumerOnSuccess,
    })

    await expect(mutation.execute(undefined)).resolves.toEqual({ name: 'after' })

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: relatedKey })
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false)
    expect(consumerOnSuccess).toHaveBeenCalledTimes(1)
  })

  it.each(['error', 'cancelled'] as const)(
    'does not invalidate related data when a mutation ends as %s',
    async (failureKind) => {
      const queryClient = createAppQueryClient()
      const relatedKey = ['test', 'account-a', 'profile'] as const
      queryClient.setQueryData(relatedKey, { name: 'before' })
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const consumerOnSuccess = vi.fn()
      const failure = new Error('controlled failure')
      failure.name = failureKind === 'cancelled' ? 'CanceledError' : 'Error'
      const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationFn: () => Promise.reject(failure),
        meta: createMutationInvalidationMeta([relatedKey]),
        onSuccess: consumerOnSuccess,
      })

      await expect(mutation.execute(undefined)).rejects.toBe(failure)

      expect(invalidateQueries).not.toHaveBeenCalled()
      expect(queryClient.getQueryState(relatedKey)?.isInvalidated).toBe(false)
      expect(consumerOnSuccess).not.toHaveBeenCalled()
    },
  )

  it('does not retry failed mutations', async () => {
    const queryClient = createAppQueryClient()
    const mutationFn = vi.fn(() => Promise.reject(new Error('failed once')))
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn })

    await expect(mutation.execute(undefined)).rejects.toThrow('failed once')

    expect(mutationFn).toHaveBeenCalledTimes(1)
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false)
  })
})

describe('remote cache lifecycle', () => {
  it('clears all queries and mutations on logout', () => {
    const queryClient = createAppQueryClient()
    queryClient.setQueryData(['test', 'account-a', 'profile'], { name: 'Ana' })
    queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.resolve('saved'),
    })
    const cache = createRemoteCacheController(queryClient)

    cache.clearForLogout()

    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(queryClient.getMutationCache().getAll()).toEqual([])
  })

  it('removes account A before account B can populate the cache', () => {
    const queryClient = createAppQueryClient()
    const accountAKey = ['test', 'account-a', 'profile'] as const
    const accountBKey = ['test', 'account-b', 'profile'] as const
    queryClient.setQueryData(accountAKey, { name: 'Cuenta A' })
    queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.resolve('account-a mutation'),
    })
    const cache = createRemoteCacheController(queryClient)

    cache.clearForAccountChange()
    queryClient.setQueryData(accountBKey, { name: 'Cuenta B' })

    expect(queryClient.getQueryData(accountAKey)).toBeUndefined()
    expect(queryClient.getQueryData(accountBKey)).toEqual({ name: 'Cuenta B' })
    expect(queryClient.getMutationCache().getAll()).toEqual([])
  })

  it('keeps remote state in memory without writing browser storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const queryClient = createAppQueryClient()

    queryClient.setQueryData(['test', 'memory-only'], { value: 'remote' })

    expect(setItem).not.toHaveBeenCalled()
  })
})
