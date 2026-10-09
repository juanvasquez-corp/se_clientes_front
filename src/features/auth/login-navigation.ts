import type { InitialDestination } from '../../app/router/navigation-policy'

export {
  homeForRole,
  UnsupportedUserRoleError,
} from '../../app/router/navigation-policy'
export type { InitialDestination } from '../../app/router/navigation-policy'

export interface LoginNavigationPort {
  readonly replace: (destination: InitialDestination) => void
}
