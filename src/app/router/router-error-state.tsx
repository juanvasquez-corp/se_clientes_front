import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { Card } from '../../shared/ui/card'

export function RouterErrorState() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const recoveryPath = useRouterState({
    select: (state) => state.location.pathname,
  })

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className="min-h-screen bg-surface-page p-4 text-text-primary lg:p-6">
      <section className="mx-auto max-w-3xl" role="alert">
        <Card.Root>
          <Card.Header>
            <h1
              className="text-2xl font-semibold text-brand-heading focus-visible:outline-offset-2"
              ref={headingRef}
              tabIndex={-1}
            >
              No pudimos cargar esta página
            </h1>
            <Card.Description>
              Ocurrió un problema al descargar el contenido. Recarga la página para
              intentarlo nuevamente.
            </Card.Description>
          </Card.Header>
          <Card.Actions>
            <a
              className="router-recovery-link inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm bg-brand-primary px-5 font-semibold no-underline transition-colors hover:bg-brand-primary-hover focus-visible:outline-offset-2 motion-reduce:transition-none"
              href={recoveryPath}
            >
              Recargar página
            </a>
          </Card.Actions>
        </Card.Root>
      </section>
    </main>
  )
}
