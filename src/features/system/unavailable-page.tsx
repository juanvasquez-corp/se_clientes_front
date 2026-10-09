import { useEffect, useRef, useState } from 'react'

import type { SecurityRecoveryController } from '../auth/security-recovery-controller'
import { SecurityRecoveryPanel } from '../auth/security-recovery-panel'
import { PageTransition } from '../../shared/layout/page-transition'
import { AsyncState } from '../../shared/ui/async-state'

export type UnavailablePageProps =
  | {
      readonly kind: 'restoration'
      readonly onRetry: () => Promise<void>
    }
  | {
      readonly kind: 'security'
      readonly controller: SecurityRecoveryController
    }

export function UnavailablePage(props: UnavailablePageProps) {
  const [pending, setPending] = useState(false)
  const attemptPending = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const retry = async () => {
    if (props.kind !== 'restoration' || attemptPending.current) return
    attemptPending.current = true
    setPending(true)
    try {
      await props.onRetry()
    } catch {
      // La indisponibilidad permanece visible para permitir un nuevo intento manual.
    } finally {
      if (mounted.current) {
        attemptPending.current = false
        setPending(false)
      }
    }
  }

  return (
    <PageTransition>
      <main className="min-h-screen bg-surface-page p-4 text-text-primary lg:p-6">
        <section className="mx-auto max-w-3xl">
          <h1 className="sr-only">
            {props.kind === 'security'
              ? 'Recuperación de seguridad'
              : 'Servicio no disponible'}
          </h1>
          {props.kind === 'security' ? (
            <SecurityRecoveryPanel controller={props.controller} />
          ) : (
            <AsyncState.Unavailable
              title="Servicio no disponible"
              description="No pudimos recuperar tu sesión. Inténtalo nuevamente."
              recovery={{
                label: 'Reintentar',
                onRetry: () => {
                  void retry()
                },
                state: pending ? 'pending' : 'idle',
              }}
            />
          )}
        </section>
      </main>
    </PageTransition>
  )
}
