import {
  createRootRouteWithContext,
  createRoute,
} from '@tanstack/react-router'

import { userUuidSchema } from '../../contracts/schemas/user'
import {
  controlledStateRouteGuard,
  loginRouteGuard,
  privateRouteGuard,
  rootRouteGuard,
  unavailableRouteGuard,
} from './guards'
import {
  NewUserRoutePlaceholder,
  ProfileRoutePlaceholder,
  RootOutlet,
  UserDetailRoutePlaceholder,
  UserEditRoutePlaceholder,
  UsersRoutePlaceholder,
} from './route-placeholders'
import { LoginRoute } from './login-route'
import type { AppRouterContext } from './router-context'
import { ForbiddenRoute, UnavailableRoute } from './system-routes'

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
  component: RootOutlet,
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
  component: ProfileRoutePlaceholder,
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
