import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import type { InitialSessionCoordinator } from '../core/session/session-coordinator'
import type { SessionStore } from '../core/session/session-store'
import { AsyncState } from '../shared/ui/async-state'

export interface SessionBootstrapProps {
  readonly children: ReactNode
  readonly coordinator: InitialSessionCoordinator
  readonly sessionStore: SessionStore
}

export function SessionBootstrap({
  children,
  coordinator,
  sessionStore,
}: SessionBootstrapProps) {
  const started = useRef(false)
  const mounted = useRef(false)
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getState,
    sessionStore.getInitialState,
  )

  useEffect(() => {
    mounted.current = true
    if (!started.current) {
      started.current = true
      void coordinator.restoreInitial()
    }

    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) coordinator.cancelInitial()
      })
    }
  }, [coordinator])

  if (session.status === 'authenticated') return children

  if (session.status === 'unavailable') {
    return (
      <AsyncState.Unavailable
        title="Servicio no disponible"
        description="No pudimos restaurar tu sesión. Inténtalo nuevamente."
        recovery={{
          label: 'Reintentar',
          onRetry: () => {
            void coordinator.retryInitial()
          },
          state: 'idle',
        }}
      />
    )
  }

  return (
    <AsyncState.Loading
      label={
        session.status === 'dead'
          ? 'Redirigiendo al inicio de sesión'
          : 'Restaurando sesión'
      }
    />
  )
}
