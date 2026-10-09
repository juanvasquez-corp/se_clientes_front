import { queryOptions } from '@tanstack/react-query'

import type { ProfileApi } from './profile-api'

export function profileQueryKey(accountUuid: string) {
  return ['profile', accountUuid] as const
}

export function profileQueryOptions(profileApi: Pick<ProfileApi, 'get'>, accountUuid: string) {
  return queryOptions({
    queryKey: profileQueryKey(accountUuid),
    queryFn: ({ signal }) => profileApi.get(signal),
    retry: false,
    staleTime: 30_000,
  })
}
