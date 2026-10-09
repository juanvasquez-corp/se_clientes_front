import type { SecurityRecoveryController } from '../auth/security-recovery-controller'
import { SecurityRecoveryPanel } from '../auth/security-recovery-panel'
import { PageTransition } from '../../shared/layout/page-transition'
import { AsyncState } from '../../shared/ui/async-state'

export type ForbiddenPageProps =
  | {
      readonly kind: 'denied'
      readonly actionLabel: string
      readonly onContinue: () => void
    }
  | {
      readonly kind: 'security'
      readonly controller: SecurityRecoveryController
    }

export function ForbiddenPage(props: ForbiddenPageProps) {
  return (
    <PageTransition>
      <main className="min-h-screen bg-surface-page p-4 text-text-primary lg:p-6">
        <section className="mx-auto max-w-3xl">
          <h1 className="sr-only">
            {props.kind === 'security' ? 'Recuperación de seguridad' : 'Acceso denegado'}
          </h1>
          {props.kind === 'security' ? (
            <SecurityRecoveryPanel controller={props.controller} />
          ) : (
            <AsyncState.Error
              title="Acceso denegado"
              description="No tienes permiso para acceder al contenido solicitado."
              recovery={{
                label: props.actionLabel,
                onRetry: props.onContinue,
                state: 'idle',
              }}
            />
          )}
        </section>
      </main>
    </PageTransition>
  )
}
