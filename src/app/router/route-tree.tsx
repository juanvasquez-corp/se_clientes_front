import {
  createRootRouteWithContext,
  createRoute,
  lazyRouteComponent,
  Outlet,
} from '@tanstack/react-router'

import { userUuidSchema } from '../../contracts/schemas/user'
import {
  controlledStateRouteGuard,
  loginRouteGuard,
  privateRouteGuard,
  rootRouteGuard,
  unavailableRouteGuard,
} from './guards'
import type { AppRouterContext } from './router-context'

const LoginRoute = lazyRouteComponent(() => import('./login-route'), 'LoginRoute')
const ProfileRoute = lazyRouteComponent(
  () => import('../../features/profile/profile-page'),
  'ProfileRoute',
)
const UsersRoutePlaceholder = lazyRouteComponent(
  () => import('./route-placeholders'),
  'UsersRoutePlaceholder',
)
const NewUserRoutePlaceholder = lazyRouteComponent(
  () => import('./route-placeholders'),
  'NewUserRoutePlaceholder',
)
const UserDetailRoutePlaceholder = lazyRouteComponent(
  () => import('./route-placeholders'),
  'UserDetailRoutePlaceholder',
)
const UserEditRoutePlaceholder = lazyRouteComponent(
  () => import('./route-placeholders'),
  'UserEditRoutePlaceholder',
)
const ForbiddenRoute = lazyRouteComponent(
  () => import('./system-routes'),
  'ForbiddenRoute',
)
const UnavailableRoute = lazyRouteComponent(
  () => import('./system-routes'),
  'UnavailableRoute',
)

export class InvalidUserUuidParamError extends Error {
  constructor() {
    super('El identificador de usuario de la ruta no es válido.')
    this.name = 'InvalidUserUuidParamError'
  }
}

function parseUserUuid(rawUserUuid: string): string {
  const result = userUuidSchema.safeParse(rawUserUuid.toLowerCase())
  if (!result.success) throw new InvalidUserUuidParamError()
  return result.data
}

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  beforeLoad: ({ context, location }) =>
    rootRouteGuard({ context, pathname: location.pathname }),
  component: Outlet,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  beforeLoad: ({ context }) => loginRouteGuard(context),
  component: LoginRoute,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'profile',
  beforeLoad: ({ context, location }) =>
    privateRouteGuard({ context, pathname: location.pathname }),
  component: ProfileRoute,
})

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'users',
  beforeLoad: ({ context, location }) =>
    privateRouteGuard({ context, pathname: location.pathname }),
  component: UsersRoutePlaceholder,
})

const newUserRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: 'new',
  component: NewUserRoutePlaceholder,
})

const userDetailRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: '$userUuid',
  params: {
    parse: (params) => ({ userUuid: parseUserUuid(params.userUuid) }),
    stringify: (params) => ({ userUuid: parseUserUuid(params.userUuid) }),
  },
  component: UserDetailRoutePlaceholder,
})

const userEditRoute = createRoute({
  getParentRoute: () => userDetailRoute,
  path: 'edit',
  component: UserEditRoutePlaceholder,
})

const forbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'forbidden',
  beforeLoad: ({ context }) => controlledStateRouteGuard(context),
  component: ForbiddenRoute,
})

const unavailableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'unavailable',
  beforeLoad: ({ context }) => unavailableRouteGuard(context),
  component: UnavailableRoute,
})

export const routeTree = rootRoute.addChildren([
  loginRoute,
  profileRoute,
  usersRoute.addChildren([
    newUserRoute,
    userDetailRoute.addChildren([userEditRoute]),
  ]),
  forbiddenRoute,
  unavailableRoute,
])
