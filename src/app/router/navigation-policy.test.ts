import { describe, expect, it } from 'vitest'

import {
  canAccessRoute,
  homeForRole,
  isUsersContext,
  navigationForRole,
  UnsupportedUserRoleError,
} from './navigation-policy'

const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'

describe('homeForRole', () => {
  it.each([
    ['superadmin', '/users'],
    ['master', '/profile'],
    ['visualizer', '/profile'],
  ] as const)('maps %s to %s without a previous-route fallback', (role, expected) => {
    expect(homeForRole(role)).toBe(expected)
  })

  it.each(['operator', '', undefined, null])('rejects unsupported runtime role %s', (role) => {
    expect(() => homeForRole(role)).toThrow(UnsupportedUserRoleError)
  })
})

describe('canAccessRoute', () => {
  it.each(['superadmin', 'master', 'visualizer'] as const)(
    'allows %s to access profile',
    (role) => {
      expect(
        canAccessRoute({ status: 'authenticated', identity: { role } }, '/profile'),
      ).toBe('allow')
    },
  )

  it.each([
    '/users',
    '/users/new',
    `/users/${USER_UUID}`,
    `/users/${USER_UUID}/edit`,
  ])('allows superadmin to access %s', (pathname) => {
    expect(
      canAccessRoute(
        { status: 'authenticated', identity: { role: 'superadmin' } },
        pathname,
      ),
    ).toBe('allow')
  })

  it.each(['master', 'visualizer'] as const)(
    'forbids every users route to %s',
    (role) => {
      for (const pathname of [
        '/users',
        '/users/new',
        `/users/${USER_UUID}`,
        `/users/${USER_UUID}/edit`,
      ]) {
        expect(
          canAccessRoute({ status: 'authenticated', identity: { role } }, pathname),
        ).toBe('forbidden')
      }
    },
  )

  it.each(['/profile', '/users', `/users/${USER_UUID}`])(
    'sends an absent session requesting %s to login',
    (pathname) => {
      expect(canAccessRoute(null, pathname)).toBe('login')
      expect(canAccessRoute({ status: 'dead' }, pathname)).toBe('login')
    },
  )

  it.each([
    [{ status: 'unknown', phase: 'restoring' }, 'unavailable'],
    [{ status: 'unavailable', context: 'initial-restoration' }, 'unavailable'],
    [{ status: 'blocked', identity: { role: 'superadmin' } }, 'forbidden'],
    [{ status: 'forbidden' }, 'forbidden'],
  ] as const)('fails closed for unusable identity state %#', (session, expected) => {
    expect(canAccessRoute(session, '/profile')).toBe(expected)
  })

  it.each([
    ['https://evil.example/users', 'superadmin'],
    ['/users/not-a-uuid', 'superadmin'],
    ['/users/2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75/extra', 'superadmin'],
    ['/dashboard', 'superadmin'],
    ['/users', 'operator'],
  ])('fails closed for runtime route/role input %s / %s', (pathname, role) => {
    expect(
      canAccessRoute({ status: 'authenticated', identity: { role } }, pathname),
    ).toBe('forbidden')
  })
})

describe('navigationForRole', () => {
  it('returns the exact immutable superadmin menu', () => {
    const navigation = navigationForRole('superadmin')

    expect(navigation).toEqual([
      { kind: 'link', label: 'Usuarios', href: '/users' },
      { kind: 'link', label: 'Mi perfil', href: '/profile' },
      { kind: 'action', label: 'Cerrar sesión', action: 'logout' },
    ])
    expect(Object.isFrozen(navigation)).toBe(true)
    expect(navigation.every(Object.isFrozen)).toBe(true)
    const logoutItem = navigation.at(2)
    expect(logoutItem).toBeDefined()
    expect(logoutItem === undefined || 'href' in logoutItem).toBe(false)
  })

  it.each(['master', 'visualizer'] as const)('returns no users item for %s', (role) => {
    expect(navigationForRole(role)).toEqual([
      { kind: 'link', label: 'Mi perfil', href: '/profile' },
      { kind: 'action', label: 'Cerrar sesión', action: 'logout' },
    ])
  })

  it('rejects an unsupported runtime role', () => {
    expect(() => navigationForRole('operator')).toThrow(UnsupportedUserRoleError)
  })
})

describe('isUsersContext', () => {
  it.each([
    '/users',
    '/users/new',
    `/users/${USER_UUID}`,
    `/users/${USER_UUID}/edit`,
  ])('accepts canonical users route %s', (pathname) => {
    expect(isUsersContext(pathname)).toBe(true)
  })

  it.each([
    '/users-old',
    '/users/',
    '/users/new/edit',
    '/users/not-a-uuid',
    `/users/${USER_UUID}/extra`,
    `/users/${USER_UUID}?tab=profile`,
    `/users/${USER_UUID}#details`,
    'https://example.test/users',
    undefined,
    null,
  ])('rejects non-canonical users pathname %s', (pathname) => {
    expect(isUsersContext(pathname)).toBe(false)
  })
})
