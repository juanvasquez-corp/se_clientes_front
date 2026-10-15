import { userUuidSchema } from '../../contracts/schemas/user'
import type { DirectoryState } from './directory-mode'
import {
  normalizePage,
  normalizePageSize,
  normalizeSearchEmail,
  parsePublicUuid,
} from './users-api'

export type UserDirectoryQueryRoot = readonly ['users', string]
export type UserDirectoryQueryKey =
  | readonly ['users', string, 'list', number, number]
  | readonly ['users', string, 'search', string]
export type UserDetailQueryKey = readonly [
  'users',
  'account',
  string,
  'detail',
  string,
]

function validatedAccountUuid(accountUuid: string): string {
  return userUuidSchema.parse(accountUuid.toLowerCase())
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

export function userDetailQueryKey(
  accountUuid: string,
  userUuid: string,
): UserDetailQueryKey {
  const validatedAccount = validatedAccountUuid(accountUuid)
  const parsedTarget = parsePublicUuid(userUuid)
  const normalizedTarget =
    parsedTarget.kind === 'valid' ? parsedTarget.userUuid : 'not-found'

  return Object.freeze([
    'users',
    'account',
    validatedAccount,
    'detail',
    normalizedTarget,
  ] as const)
}
