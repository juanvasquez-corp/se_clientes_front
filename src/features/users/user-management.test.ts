import { describe, expect, it } from 'vitest'

import { canManageTarget } from './user-management'

const CURRENT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'

describe('canManageTarget', () => {
  it('allows only a distinct, complete target UUID', () => {
    expect(canManageTarget(CURRENT_UUID, OTHER_UUID)).toBe(true)
    expect(canManageTarget(CURRENT_UUID, CURRENT_UUID)).toBe(false)
    expect(canManageTarget(CURRENT_UUID, `${CURRENT_UUID}extra`)).toBe(false)
    expect(canManageTarget(CURRENT_UUID, CURRENT_UUID.slice(0, 8))).toBe(false)
  })

  it('compares canonical UUID identity and fails closed for invalid values', () => {
    expect(canManageTarget(CURRENT_UUID.toUpperCase(), CURRENT_UUID)).toBe(false)
    expect(canManageTarget('internal-id', OTHER_UUID)).toBe(false)
    expect(canManageTarget(CURRENT_UUID, 'internal-id')).toBe(false)
  })
})
