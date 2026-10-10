import { AsyncState } from '../../shared/ui/async-state'

export function RouterPendingState() {
  return (
    <main className="min-h-screen bg-surface-page p-4 lg:p-6">
      <section className="mx-auto max-w-3xl">
        <AsyncState.Loading label="Restaurando sesión" />
      </section>
    </main>
  )
}
