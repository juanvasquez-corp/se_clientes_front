import { describe, expect, expectTypeOf, it } from 'vitest'

import type { UserRole } from '../../contracts/schemas/user'
import { profileModeForRole } from './profile-mode'

describe('profileModeForRole', () => {
  it('maps every validated role to its explicit profile mode', () => {
    expectTypeOf(profileModeForRole).parameter(0).toEqualTypeOf<UserRole>()
    expect(profileModeForRole('visualizer')).toBe('readonly')
    expect(profileModeForRole('master')).toBe('editable')
    expect(profileModeForRole('superadmin')).toBe('editable')
  })
})
