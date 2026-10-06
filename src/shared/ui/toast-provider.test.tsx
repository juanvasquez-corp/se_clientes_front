import { act, useState } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { useToast } from './toast-context'
import { ToastProvider } from './toast-provider'

const roots: ReturnType<typeof createRoot>[] = []

function ToastHarness() {
  const { showError, showSuccess } = useToast()
  const [renderCount, setRenderCount] = useState(0)

  return (
    <div>
      <span>Render {renderCount}</span>
      <button
        type="button"
        onClick={() => {
          showSuccess({
            dedupeKey: 'save-profile',
            message: 'Cambios guardados correctamente.',
          })
        }}
      >
        Mostrar éxito
      </button>
      <button
        type="button"
        onClick={() => {
          showError({
            dedupeKey: 'save-error',
            message: 'No pudimos guardar los cambios.',
          })
        }}
      >
        Mostrar error
      </button>
      <button
        type="button"
        onClick={() => {
          showSuccess({
            dedupeKey: 'duplicate-action',
            message: 'Operación completada.',
          })
          showSuccess({
            dedupeKey: 'duplicate-action',
            message: 'Operación completada.',
          })
        }}
      >
        Mostrar duplicado
      </button>
      <button
        type="button"
        onClick={() => {
          showSuccess({
            dedupeKey: 'first-action',
            message: 'Mismo mensaje.',
          })
          showSuccess({
            dedupeKey: 'second-action',
            message: 'Mismo mensaje.',
          })
        }}
      >
        Mostrar mismo mensaje
      </button>
      <button
        type="button"
        onClick={() => {
          setRenderCount((count) => count + 1)
        }}
      >
        Renderizar nuevamente
      </button>
      <button
        type="button"
        onClick={() => {
          showSuccess({
            dedupeKey: 'unsafe-looking-content',
            message: '<img src=x onerror=alert(1)>',
          })
        }}
      >
        Mostrar texto externo
      </button>
    </div>
  )
}

function PendingActionHarness() {
  const { showSuccess } = useToast()
  const [state, setState] = useState<'idle' | 'pending'>('idle')

  const submit = () => {
    setState('pending')
    showSuccess({
      dedupeKey: 'pending-submit',
      message: 'Solicitud recibida.',
    })
    showSuccess({
      dedupeKey: 'pending-submit',
      message: 'Solicitud recibida.',
    })
  }

  return (
    <button type="button" disabled={state === 'pending'} onClick={submit}>
      {state === 'pending' ? 'Enviando...' : 'Enviar'}
    </button>
  )
}

function renderProvider(children: React.ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(<ToastProvider>{children}</ToastProvider>)
  })

  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('ToastProvider', () => {
  it('announces success politely once without stealing focus', async () => {
    const user = userEvent.setup()
    const container = renderProvider(<ToastHarness />)
    const trigger = screen.getByRole('button', { name: 'Mostrar éxito' })

    await user.click(trigger)
    const status = screen.getByRole('status')

    expect(document.activeElement).toBe(trigger)
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toContain('Cambios guardados correctamente.')
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1)
    expect(status.parentElement?.closest('[aria-live]')).toBeNull()
  })

  it('announces errors assertively in one alert region', async () => {
    const user = userEvent.setup()
    const container = renderProvider(<ToastHarness />)

    await user.click(screen.getByRole('button', { name: 'Mostrar error' }))
    const alert = screen.getByRole('alert')

    expect(alert.getAttribute('aria-live')).toBe('assertive')
    expect(alert.textContent).toContain('No pudimos guardar los cambios.')
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(alert.parentElement?.closest('[role="alert"]')).toBeNull()
    expect(
      alert.closest('[data-toast]')?.classList.contains('bg-surface-card'),
    ).toBe(true)
  })

  it('deduplicates by action key instead of message content', async () => {
    const user = userEvent.setup()
    renderProvider(<ToastHarness />)

    await user.click(screen.getByRole('button', { name: 'Mostrar duplicado' }))
    expect(screen.getAllByRole('status')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Mostrar mismo mensaje' }))
    expect(screen.getAllByText('Mismo mensaje.')).toHaveLength(2)
  })

  it('keeps stable IDs through rerenders and closes by keyboard', async () => {
    const user = userEvent.setup()
    renderProvider(<ToastHarness />)

    await user.click(screen.getByRole('button', { name: 'Mostrar éxito' }))
    const toast = screen.getByRole('status').closest('[data-toast]')
    const toastId = toast?.id

    expect(toastId).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: 'Renderizar nuevamente' }),
    )
    expect(screen.getByRole('status').closest('[data-toast]')?.id).toBe(toastId)

    const close = screen.getByRole('button', { name: 'Cerrar notificación' })
    close.focus()
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('blocks repeated pending submissions and creates one toast', async () => {
    const user = userEvent.setup()
    renderProvider(<PendingActionHarness />)
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar' })

    await user.dblClick(submit)

    expect(submit.disabled).toBe(true)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('renders external-looking messages as text', async () => {
    const user = userEvent.setup()
    const container = renderProvider(<ToastHarness />)
    const content = '<img src=x onerror=alert(1)>'

    await user.click(screen.getByRole('button', { name: 'Mostrar texto externo' }))

    expect(screen.getByText(content)).toBeTruthy()
    expect(container.querySelector('[data-toast] img')).toBeNull()
  })

  it('has no axe violations with success and error toasts', async () => {
    const user = userEvent.setup()
    const container = renderProvider(<ToastHarness />)

    await user.click(screen.getByRole('button', { name: 'Mostrar éxito' }))
    await user.click(screen.getByRole('button', { name: 'Mostrar error' }))
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
