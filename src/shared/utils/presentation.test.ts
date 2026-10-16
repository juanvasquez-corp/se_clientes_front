import { describe, expect, expectTypeOf, it } from 'vitest'

import type { components } from '../../contracts/generated/api'
import {
  formatNullable,
  getInitials,
  rolePresentation,
  statusPresentation,
} from './presentation'

type UserRole = components['schemas']['UserResponse']['role']

describe('presentation utilities', () => {
  it.each([
    ['Juan', 'Pérez', 'JP'],
    ['  María  ', '  ', 'M'],
    ['', 'López', 'L'],
    ['élodie', 'ñíguez', 'ÉÑ'],
    ['李', '王', '李王'],
    ['👩🏽 Ana', 'O’Neill', 'AO'],
    ['', '', '?'],
    ['   ', '---', '?'],
  ])('gets safe initials from %j and %j', (name, lastName, expected) => {
    expect(getInitials(name, lastName)).toBe(expected)
  })

  it.each([
    [null, 'No informado'],
    ['', 'No informado'],
    ['   ', 'No informado'],
    ['  +57 300 123 4567  ', '+57 300 123 4567'],
  ])('formats nullable value %j as %j', (value, expected) => {
    expect(formatNullable(value)).toBe(expected)
  })

  it('maps only contract roles to Spanish labels and explicit variants', () => {
    expectTypeOf(rolePresentation).parameter(0).toEqualTypeOf<UserRole>()

    expect(rolePresentation('superadmin')).toEqual({
      label: 'Superadministrador',
      variant: 'role-superadmin',
    })
    expect(rolePresentation('master')).toEqual({
      label: 'Master',
      variant: 'role-master',
    })
    expect(rolePresentation('visualizer')).toEqual({
      label: 'Visualizador',
      variant: 'role-visualizer',
    })
  })

  it('maps account status without exposing boolean values', () => {
    expect(statusPresentation(true)).toEqual({
      label: 'Activo',
      variant: 'status-active',
    })
    expect(statusPresentation(false)).toEqual({
      label: 'Inactivo',
      variant: 'status-inactive',
    })
  })
})
