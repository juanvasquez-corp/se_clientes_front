import type { UserRole } from '../../contracts/schemas/user'

export type InitialDestination = '/profile' | '/users'

export interface LoginNavigationPort {
  readonly replace: (destination: InitialDestination) => void
}

export class UnsupportedUserRoleError extends Error {
  constructor(role: string) {
    super(`No fue posible resolver el destino para el rol "${role}".`)
    this.name = 'UnsupportedUserRoleError'
  }
}

function unsupportedRole(role: never): never {
  throw new UnsupportedUserRoleError(String(role))
}

export function homeForRole(role: UserRole): InitialDestination {
  switch (role) {
    case 'superadmin':
      return '/users'
    case 'master':
    case 'visualizer':
      return '/profile'
    default:
      return unsupportedRole(role)
  }
}
