import {
  userRoleSchema,
  userUuidSchema,
  type UserRole,
} from '../../contracts/schemas/user'

export type InitialDestination = '/profile' | '/users'
export type RouteAccessOutcome = 'allow' | 'login' | 'forbidden' | 'unavailable'

export type NavigationItem =
  | {
      readonly kind: 'link'
      readonly label: 'Usuarios' | 'Mi perfil'
      readonly href: InitialDestination
    }
  | {
      readonly kind: 'action'
      readonly label: 'Cerrar sesión'
      readonly action: 'logout'
    }

export class UnsupportedUserRoleError extends Error {
  constructor(role: unknown) {
    super(`No fue posible resolver la navegación para el rol "${String(role)}".`)
    this.name = 'UnsupportedUserRoleError'
  }
}

const USERS_ITEM: NavigationItem = Object.freeze({
  kind: 'link',
  label: 'Usuarios',
  href: '/users',
})
const PROFILE_ITEM: NavigationItem = Object.freeze({
  kind: 'link',
  label: 'Mi perfil',
  href: '/profile',
})
const LOGOUT_ITEM: NavigationItem = Object.freeze({
  kind: 'action',
  label: 'Cerrar sesión',
  action: 'logout',
})
const ADMIN_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  USERS_ITEM,
  PROFILE_ITEM,
  LOGOUT_ITEM,
])
const PROFILE_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  PROFILE_ITEM,
  LOGOUT_ITEM,
])

function parseRole(role: unknown): UserRole | undefined {
  const result = userRoleSchema.safeParse(role)
  return result.success ? result.data : undefined
}

function requireRole(role: unknown): UserRole {
  const parsedRole = parseRole(role)
  if (parsedRole === undefined) throw new UnsupportedUserRoleError(role)
  return parsedRole
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUserDetailContext(pathname: string): boolean {
  const segments = pathname.split('/')
  if (
    (segments.length !== 3 && segments.length !== 4) ||
    segments[0] !== '' ||
    segments[1] !== 'users' ||
    segments[2] === undefined
  ) {
    return false
  }

  if (!userUuidSchema.safeParse(segments[2]).success) return false
  return segments.length === 3 || segments[3] === 'edit'
}

export function homeForRole(role: unknown): InitialDestination {
  return requireRole(role) === 'superadmin' ? '/users' : '/profile'
}

export function navigationForRole(role: unknown): readonly NavigationItem[] {
  return requireRole(role) === 'superadmin' ? ADMIN_NAVIGATION : PROFILE_NAVIGATION
}

export function isUsersContext(pathname: unknown): boolean {
  if (typeof pathname !== 'string') return false
  return pathname === '/users' || pathname === '/users/new' || isUserDetailContext(pathname)
}

export function canAccessRoute(
  session: unknown,
  pathname: unknown,
): RouteAccessOutcome {
  if (session === null || session === undefined) return 'login'
  if (!isRecord(session)) return 'forbidden'

  const status = session.status
  if (status === 'dead') return 'login'
  if (status === 'unknown' || status === 'unavailable') return 'unavailable'
  if (status === 'forbidden' || status === 'blocked') return 'forbidden'
  if (status !== 'authenticated') return 'forbidden'

  const identity = session.identity
  if (!isRecord(identity)) return 'forbidden'
  const role = parseRole(Reflect.get(identity, 'role'))
  if (role === undefined || typeof pathname !== 'string') return 'forbidden'

  if (pathname === '/profile') return 'allow'
  if (!isUsersContext(pathname)) return 'forbidden'
  return role === 'superadmin' ? 'allow' : 'forbidden'
}
