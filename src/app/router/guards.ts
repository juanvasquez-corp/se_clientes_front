import { redirect } from '@tanstack/react-router'

import {
  canAccessRoute,
  homeForRole,
  isUsersContext,
  UnsupportedUserRoleError,
} from './navigation-policy'
import type { AppRouterContext } from './router-context'

type GuardDestination = '/login' | '/profile' | '/users' | '/forbidden' | '/unavailable'

export interface RouteGuardInput {
  readonly context: AppRouterContext
  readonly pathname: string
}

function isNormativePath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/profile' ||
    pathname === '/forbidden' ||
    pathname === '/unavailable' ||
    isUsersContext(pathname)
  )
}

function redirectTo(destination: GuardDestination): never {
  redirect({
    to: destination,
    replace: true,
    search: {},
    hash: '',
    throw: true,
  })
  throw new Error('No fue posible ejecutar la redirección protegida.')
}

function homeDestination(role: unknown): GuardDestination {
  try {
    return homeForRole(role)
  } catch (error) {
    if (error instanceof UnsupportedUserRoleError) return '/forbidden'
    throw error
  }
}

async function waitForInitialResolution(context: AppRouterContext): Promise<void> {
  if (context.session.store.getState().status !== 'unknown') return
  await context.session.coordinator.restoreInitial()
}

async function resolveOrRedirectUnavailable(context: AppRouterContext): Promise<void> {
  try {
    await waitForInitialResolution(context)
  } catch {
    redirectTo('/unavailable')
  }
}

export async function privateRouteGuard({
  context,
  pathname,
}: RouteGuardInput): Promise<void> {
  await resolveOrRedirectUnavailable(context)

  const outcome = canAccessRoute(context.session.store.getState(), pathname)
  switch (outcome) {
    case 'allow':
      return
    case 'login':
      return redirectTo('/login')
    case 'forbidden':
      return redirectTo('/forbidden')
    case 'unavailable':
      return redirectTo('/unavailable')
  }
}

export async function rootRouteGuard({
  context,
  pathname,
}: RouteGuardInput): Promise<void> {
  if (isNormativePath(pathname)) return
  await resolveOrRedirectUnavailable(context)

  const session = context.session.store.getState()
  switch (session.status) {
    case 'authenticated':
      return redirectTo(
        pathname === '/' ? homeDestination(session.identity.role) : '/forbidden',
      )
    case 'dead':
      return redirectTo('/login')
    case 'blocked':
    case 'forbidden':
      return redirectTo('/forbidden')
    case 'unknown':
    case 'unavailable':
      return redirectTo('/unavailable')
  }
}

export async function loginRouteGuard(context: AppRouterContext): Promise<void> {
  await resolveOrRedirectUnavailable(context)

  const session = context.session.store.getState()
  switch (session.status) {
    case 'authenticated':
      return redirectTo(homeDestination(session.identity.role))
    case 'dead':
      return
    case 'blocked':
    case 'forbidden':
      return redirectTo('/forbidden')
    case 'unknown':
    case 'unavailable':
      return redirectTo('/unavailable')
  }
}

export async function controlledStateRouteGuard(
  context: AppRouterContext,
): Promise<void> {
  try {
    await waitForInitialResolution(context)
  } catch {
    // La ruta de estado actual permanece disponible y evita un ciclo de redirección.
  }
}

export async function unavailableRouteGuard(context: AppRouterContext): Promise<void> {
  await resolveOrRedirectUnavailable(context)
  const session = context.session.store.getState()
  switch (session.status) {
    case 'authenticated':
      return redirectTo(homeDestination(session.identity.role))
    case 'dead':
      return redirectTo('/login')
    case 'blocked':
    case 'forbidden':
      return redirectTo('/forbidden')
    case 'unknown':
    case 'unavailable':
      return
  }
}
