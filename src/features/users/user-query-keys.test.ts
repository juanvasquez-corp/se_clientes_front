import { describe, expect, it } from 'vitest'

import {
  userDetailQueryKey,
  userDirectoryQueryKey,
  userDirectoryQueryRoot,
} from './user-query-keys'

const FIRST_ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const SECOND_ACCOUNT_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const TARGET_USER_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const UPPERCASE_TARGET_USER_UUID = '9B1DEB4D-3B7D-4BAD-9BDD-2B0D7B3DCB6D'

describe('user directory query keys', () => {
  it('isolates list keys by validated account and normalized pagination', () => {
    const first = userDirectoryQueryKey(FIRST_ACCOUNT_UUID, {
      kind: 'list',
      page: 2.9,
      size: 99,
    })
    const second = userDirectoryQueryKey(SECOND_ACCOUNT_UUID, {
      kind: 'list',
      page: 2,
      size: 50,
    })

    expect(first).toEqual(['users', FIRST_ACCOUNT_UUID, 'list', 1, 50])
    expect(second).toEqual(['users', SECOND_ACCOUNT_UUID, 'list', 2, 50])
    expect(first).not.toEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('normalizes exact email without allowing another mode or filter in the key', () => {
    const key = userDirectoryQueryKey(FIRST_ACCOUNT_UUID, {
      kind: 'search',
      email: '  ANA@EXAMPLE.COM ',
      preservedPage: 3,
      size: 20,
    })

    expect(key).toEqual(['users', FIRST_ACCOUNT_UUID, 'search', 'ana@example.com'])
    expect(Object.isFrozen(key)).toBe(true)
  })

  it('returns an immutable account root and rejects an invalid session identity', () => {
    const root = userDirectoryQueryRoot(FIRST_ACCOUNT_UUID)

    expect(root).toEqual(['users', FIRST_ACCOUNT_UUID])
    expect(Object.isFrozen(root)).toBe(true)
    expect(() => userDirectoryQueryRoot('internal-id')).toThrow()
  })

  it('builds an immutable detail key isolated by authenticated account and normalized target UUID', () => {
    const first = userDetailQueryKey(FIRST_ACCOUNT_UUID, UPPERCASE_TARGET_USER_UUID)
    const second = userDetailQueryKey(SECOND_ACCOUNT_UUID, TARGET_USER_UUID)
    const differentTarget = userDetailQueryKey(FIRST_ACCOUNT_UUID, SECOND_ACCOUNT_UUID)

    expect(first).toEqual([
      'users',
      'account',
      FIRST_ACCOUNT_UUID,
      'detail',
      TARGET_USER_UUID,
    ])
    expect(second).toEqual([
      'users',
      'account',
      SECOND_ACCOUNT_UUID,
      'detail',
      TARGET_USER_UUID,
    ])
    expect(differentTarget).toEqual([
      'users',
      'account',
      FIRST_ACCOUNT_UUID,
      'detail',
      SECOND_ACCOUNT_UUID,
    ])
    expect(first).not.toEqual(second)
    expect(first).not.toEqual(differentTarget)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('does not leak invalid target identifiers into detail query keys and rejects invalid account UUID', () => {
    const invalidCedulaKey = userDetailQueryKey(FIRST_ACCOUNT_UUID, '1023456789')
    const invalidPathKey = userDetailQueryKey(FIRST_ACCOUNT_UUID, '../me')

    expect(invalidCedulaKey).toEqual([
      'users',
      'account',
      FIRST_ACCOUNT_UUID,
      'detail',
      'not-found',
    ])
    expect(invalidPathKey).toEqual([
      'users',
      'account',
      FIRST_ACCOUNT_UUID,
      'detail',
      'not-found',
    ])
    expect(Object.isFrozen(invalidCedulaKey)).toBe(true)
    expect(() => userDetailQueryKey('internal-id', TARGET_USER_UUID)).toThrow()
  })
})
