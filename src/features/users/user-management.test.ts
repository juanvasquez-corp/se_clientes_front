import { describe, expect, it } from 'vitest'

import { canManageTarget, detailActionsFor } from './user-management'

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

describe('detailActionsFor', () => {
  it('enables edit, status toggle and delete for a distinct valid target UUID', () => {
    expect(detailActionsFor(CURRENT_UUID, OTHER_UUID.toUpperCase())).toEqual({
      isSelf: false,
      canEdit: true,
      canToggleStatus: true,
      canDelete: true,
      showSelfRestrictionNotice: false,
      targetUserUuid: OTHER_UUID,
    })
  })

  it('enables edit but disables status toggle and delete with self notice for the own account', () => {
    expect(detailActionsFor(CURRENT_UUID.toUpperCase(), CURRENT_UUID)).toEqual({
      isSelf: true,
      canEdit: true,
      canToggleStatus: false,
      canDelete: false,
      showSelfRestrictionNotice: true,
      targetUserUuid: CURRENT_UUID,
    })
  })

  it.each([
    ['invalid current UUID', 'internal-id', OTHER_UUID],
    ['invalid target UUID', CURRENT_UUID, '1023456789'],
    ['empty target UUID', CURRENT_UUID, ''],
    ['path traversal target', CURRENT_UUID, '../me'],
  ])('fails closed when given %s', (_label, currentUuid, targetUuid) => {
    expect(detailActionsFor(currentUuid, targetUuid)).toEqual({
      isSelf: false,
      canEdit: false,
      canToggleStatus: false,
      canDelete: false,
      showSelfRestrictionNotice: false,
      targetUserUuid: null,
    })
  })
})
