import { useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useStore } from 'zustand/react'

import type { InitialRestorationResult } from '../../core/session/session-coordinator'
import type { SessionStoreState } from '../../core/session/session-store'
import { ForbiddenPage } from '../../features/system/forbidden-page'
import { UnavailablePage } from '../../features/system/unavailable-page'
import { homeForRole, type InitialDestination } from './navigation-policy'

type StateDestination = InitialDestination | '/forbidden' | '/login'

function destinationAfterRetry(
  result: InitialRestorationResult,
  session: SessionStoreState,
): StateDestination | undefined {
  if (session.status === 'authenticated') return homeForRole(session.identity.role)
  if (session.status === 'dead' || result === 'dead') return '/login'
  if (session.status === 'forbidden' || session.status === 'blocked') return '/forbidden'
  return undefined
}

export function ForbiddenRoute() {
  const router = useRouter()
  const sessionContext = router.options.context.session
  const session = useStore(sessionContext.store)
  const securityController = useMemo(
    () =>
      session.status === 'blocked'
        ? sessionContext.createSecurityRecoveryController()
        : undefined,
    [session.status, sessionContext],
  )

  if (securityController !== undefined) {
    return <ForbiddenPage kind="security" controller={securityController} />
  }

  const authenticated = session.status === 'authenticated'
  const destination = authenticated ? homeForRole(session.identity.role) : '/login'
  return (
    <ForbiddenPage
      kind="denied"
      actionLabel={authenticated ? 'Volver a mi espacio' : 'Ir al inicio de sesión'}
      onContinue={() => {
        if (!authenticated) sessionContext.store.getState().markDead()
        void router.navigate({ to: destination, replace: true })
      }}
    />
  )
}

export function UnavailableRoute() {
  const router = useRouter()
  const sessionContext = router.options.context.session
  const session = useStore(sessionContext.store)
  const isSecurityRecovery =
    session.status === 'unavailable' && session.context === 'security-recovery'
  const securityController = useMemo(
    () =>
      isSecurityRecovery
        ? sessionContext.createSecurityRecoveryController()
        : undefined,
    [isSecurityRecovery, sessionContext],
  )

  if (securityController !== undefined) {
    return <UnavailablePage kind="security" controller={securityController} />
  }

  return (
    <UnavailablePage
      kind="restoration"
      onRetry={async () => {
        const result = await sessionContext.coordinator.retryInitial()
        if (router.state.location.pathname !== '/unavailable') return
        const destination = destinationAfterRetry(
          result,
          sessionContext.store.getState(),
        )
        if (destination !== undefined) {
          await router.navigate({ to: destination, replace: true })
        }
      }}
    />
  )
}
