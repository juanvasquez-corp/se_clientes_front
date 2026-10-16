import { Outlet, useParams, useRouter, useRouterState } from '@tanstack/react-router'
import { useStore } from 'zustand/react'

import type { SessionFailureState } from '../../core/http/api-client'
import type { SessionStore } from '../../core/session/session-store'
import { PrivateShell } from '../../app/router/route-placeholders'
import { PageTransition } from '../../shared/layout/page-transition'
import { UserDetailPage } from './user-detail-page'
import { UsersPage } from './users-page'

function handleUsersSessionOutcome(
  router: ReturnType<typeof useRouter>,
  sessionStore: SessionStore,
  state: SessionFailureState,
) {
  if (state === 'unavailable') return
  if (state === 'dead') {
    sessionStore.getState().markDead()
  } else {
    sessionStore.getState().markRefreshBlocked()
  }
  void router.navigate({
    to: state === 'dead' ? '/login' : '/forbidden',
    replace: true,
  })
}

function UsersDirectoryRouteContent() {
  const router = useRouter()
  const sessionStore = router.options.context.session.store
  const usersApi = router.options.context.session.usersApi
  const identity = useStore(sessionStore, (state) =>
    state.status === 'authenticated' ? state.identity : undefined,
  )

  if (identity?.role !== 'superadmin') return null

  return (
    <UsersPage
      accountUuid={identity.userUuid}
      currentUserUuid={identity.userUuid}
      usersApi={usersApi}
      actionPolicy={{ kind: 'deferred' }}
      onSessionOutcome={(state) => {
        handleUsersSessionOutcome(router, sessionStore, state)
      }}
    />
  )
}

function UserDetailRouteContent() {
  const router = useRouter()
  const { userUuid } = useParams({ from: '/users/$userUuid' })
  const sessionStore = router.options.context.session.store
  const usersApi = router.options.context.session.usersApi
  const identity = useStore(sessionStore, (state) =>
    state.status === 'authenticated' ? state.identity : undefined,
  )

  if (identity?.role !== 'superadmin') return null

  return (
    <UserDetailPage
      accountUuid={identity.userUuid}
      currentUserUuid={identity.userUuid}
      userUuid={userUuid}
      usersApi={usersApi}
      actionPolicy={{ kind: 'deferred' }}
      onSessionOutcome={(state) => {
        handleUsersSessionOutcome(router, sessionStore, state)
      }}
    />
  )
}

export function UsersRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <PrivateShell>
      {pathname === '/users' ? (
        <PageTransition>
          <UsersDirectoryRouteContent />
        </PageTransition>
      ) : (
        <Outlet />
      )}
    </PrivateShell>
  )
}

export function UserDetailRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return pathname.endsWith('/edit') ? (
    <Outlet />
  ) : (
    <PageTransition>
      <UserDetailRouteContent />
    </PageTransition>
  )
}
