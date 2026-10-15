import { userUuidSchema } from '../../contracts/schemas/user'
import type { DirectoryState } from './directory-mode'
import {
  normalizePage,
  normalizePageSize,
  normalizeSearchEmail,
} from './users-api'

export type UserDirectoryQueryRoot = readonly ['users', string]
export type UserDirectoryQueryKey =
  | readonly ['users', string, 'list', number, number]
  | readonly ['users', string, 'search', string]

function validatedAccountUuid(accountUuid: string): string {
  return userUuidSchema.parse(accountUuid)
}

export function userDirectoryQueryRoot(accountUuid: string): UserDirectoryQueryRoot {
  return Object.freeze(['users', validatedAccountUuid(accountUuid)] as const)
}

export function userDirectoryQueryKey(
  accountUuid: string,
  state: DirectoryState,
): UserDirectoryQueryKey {
  const validatedUuid = validatedAccountUuid(accountUuid)
  return state.kind === 'list'
    ? Object.freeze([
        'users',
        validatedUuid,
        'list',
        normalizePage(state.page),
        normalizePageSize(state.size),
      ] as const)
    : Object.freeze([
        'users',
        validatedUuid,
        'search',
        normalizeSearchEmail(state.email),
      ] as const)
}
