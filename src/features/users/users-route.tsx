import { Outlet, useRouter, useRouterState } from '@tanstack/react-router'
import { useStore } from 'zustand/react'

import type { SessionFailureState } from '../../core/http/api-client'
import { PrivateShell } from '../../app/router/route-placeholders'
import { PageTransition } from '../../shared/layout/page-transition'
import { UsersPage } from './users-page'

function UsersDirectoryRouteContent() {
  const router = useRouter()
  const sessionStore = router.options.context.session.store
  const usersApi = router.options.context.session.usersApi
  const identity = useStore(sessionStore, (state) =>
    state.status === 'authenticated' ? state.identity : undefined,
  )

  if (identity?.role !== 'superadmin') return null

  const handleSessionOutcome = (state: SessionFailureState) => {
    if (state === 'unavailable') return
    if (state === 'dead') sessionStore.getState().markDead()
    void router.navigate({
      to: state === 'dead' ? '/login' : '/forbidden',
      replace: true,
    })
  }

  return (
    <UsersPage
      accountUuid={identity.userUuid}
      currentUserUuid={identity.userUuid}
      usersApi={usersApi}
      actionPolicy={{ kind: 'deferred' }}
      onSessionOutcome={handleSessionOutcome}
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
