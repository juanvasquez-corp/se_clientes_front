import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { LogoutDialog } from '../features/auth/logout-dialog'
import { LoginPage } from '../features/auth/login-page'
import { homeForRole } from '../features/auth/login-navigation'
import { SecurityRecoveryPanel } from '../features/auth/security-recovery-panel'
import { AsyncState } from '../shared/ui/async-state'
import { Card } from '../shared/ui/card'
import { SessionBootstrap } from './session-bootstrap'
import { SessionCoordinationWarning } from './session-coordination-warning'
import type { AppRuntime } from './session-runtime'

export interface AppProps {
  readonly runtime: AppRuntime
}

function PrivatePlaceholder({ runtime }: AppProps) {
  return (
    <main className="min-h-screen bg-surface-page p-6 text-text-primary">
      <section className="mx-auto grid max-w-3xl gap-6">
        <img
          className="h-auto w-40"
          src="/assets/aliar-logo.svg"
          alt="Aliar S.A."
          width="160"
          height="52"
        />
        <SessionCoordinationWarning mode={runtime.coordinationMode} />
        <Card.Root>
          <Card.Header>
            <h1 className="font-semibold text-brand-heading">Contenido privado</h1>
            <Card.Description>
              La sesión validada habilitó el área protegida.
            </Card.Description>
          </Card.Header>
          <Card.Actions>
            <LogoutDialog controller={runtime.logoutController} />
          </Card.Actions>
        </Card.Root>
      </section>
    </main>
  )
}

function SecurityRoute({ runtime }: AppProps) {
  const [controller] = useState(() =>
    runtime.createSecurityRecoveryController(),
  )
  return (
    <main className="min-h-screen bg-surface-page p-6 text-text-primary">
      <section className="mx-auto max-w-3xl">
        <SecurityRecoveryPanel controller={controller} />
      </section>
    </main>
  )
}

export function App({ runtime }: AppProps) {
  const mounted = useRef(false)
  const deliveredDestination = useRef<string | undefined>(undefined)
  const path = useSyncExternalStore(
    runtime.navigation.subscribe,
    runtime.navigation.currentPath,
    runtime.navigation.currentPath,
  )
  const session = useSyncExternalStore(
    runtime.sessionStore.subscribe,
    runtime.sessionStore.getState,
    runtime.sessionStore.getInitialState,
  )
  const isAuthorizedPrivatePath =
    session.status === 'authenticated' &&
    (path === '/profile' ||
      (path === '/users' && session.identity.role === 'superadmin'))
  const resolvedDestination =
    session.status === 'authenticated'
      ? isAuthorizedPrivatePath
        ? undefined
        : homeForRole(session.identity.role)
      : session.status === 'dead'
        ? '/login'
        : session.status === 'blocked' || session.status === 'forbidden'
          ? '/forbidden'
          : session.status === 'unavailable'
            ? '/unavailable'
            : undefined

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) runtime.close()
      })
    }
  }, [runtime])

  useEffect(() => {
    if (resolvedDestination !== undefined && path !== resolvedDestination) {
      if (deliveredDestination.current !== resolvedDestination) {
        deliveredDestination.current = resolvedDestination
        runtime.navigation.replace(resolvedDestination)
      }
      return
    }
    deliveredDestination.current = undefined
  }, [path, resolvedDestination, runtime.navigation])

  if (
    session.status === 'unknown' &&
    (session.phase === 'initial' ||
      session.phase === 'restoring' ||
      session.phase === 'restoration-profile')
  ) {
    return (
      <SessionBootstrap
        coordinator={runtime.coordinator}
        sessionStore={runtime.sessionStore}
      >
        <PrivatePlaceholder runtime={runtime} />
      </SessionBootstrap>
    )
  }

  if (resolvedDestination !== undefined && path !== resolvedDestination) {
    return <AsyncState.Loading label="Redirigiendo sesión" />
  }

  if (path === '/login') {
    return (
      <LoginPage
        navigation={runtime.navigation}
        onSubmit={runtime.login}
        sessionStore={runtime.sessionStore}
      />
    )
  }

  if (
    path === '/forbidden' &&
    (session.status === 'blocked' ||
      (session.status === 'unavailable' &&
        session.context === 'security-recovery'))
  ) {
    return <SecurityRoute runtime={runtime} />
  }

  if (path === '/forbidden' && session.status === 'forbidden') {
    return (
      <main className="min-h-screen bg-surface-page p-6 text-text-primary">
        <section className="mx-auto max-w-3xl">
          <AsyncState.Error
            title="Acceso denegado"
            description="No fue posible habilitar el acceso solicitado."
          />
        </section>
      </main>
    )
  }

  if (path === '/unavailable') {
    if (
      session.status === 'unavailable' &&
      session.context === 'security-recovery'
    ) {
      return <SecurityRoute runtime={runtime} />
    }
    return (
      <main className="min-h-screen bg-surface-page p-6 text-text-primary">
        <section className="mx-auto max-w-3xl">
          <AsyncState.Unavailable
            title="Servicio no disponible"
            description="No pudimos restaurar tu sesión. Inténtalo nuevamente."
            recovery={{
              label: 'Reintentar',
              state: 'idle',
              onRetry: () => {
                void runtime.coordinator.retryInitial()
              },
            }}
          />
        </section>
      </main>
    )
  }

  if (isAuthorizedPrivatePath) {
    return <PrivatePlaceholder runtime={runtime} />
  }

  return (
    <SessionBootstrap
      coordinator={runtime.coordinator}
      sessionStore={runtime.sessionStore}
    >
      <PrivatePlaceholder runtime={runtime} />
    </SessionBootstrap>
  )
}
