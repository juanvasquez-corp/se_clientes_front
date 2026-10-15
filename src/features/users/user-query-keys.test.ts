import { describe, expect, it } from 'vitest'

import { userDirectoryQueryKey, userDirectoryQueryRoot } from './user-query-keys'

const FIRST_ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const SECOND_ACCOUNT_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'

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
})
