import { act, useState } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AsyncState, type RecoveryState } from './async-state'
import { Button } from './button'

const roots: ReturnType<typeof createRoot>[] = []

function renderState(state: React.ReactNode) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(state)
  })

  return container
}

interface RetryHarnessProps {
  onRetry: () => void
  variant: 'error' | 'unavailable'
}

function RetryHarness({ onRetry, variant }: RetryHarnessProps) {
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('idle')
  const retry = () => {
    setRecoveryState('pending')
    onRetry()
  }
  const recovery = {
    label: 'Reintentar',
    onRetry: retry,
    state: recoveryState,
  } as const

  return variant === 'error' ? (
    <AsyncState.Error
      title="No pudimos cargar el contenido"
      description="Inténtalo nuevamente."
      recovery={recovery}
    />
  ) : (
    <AsyncState.Unavailable
      title="Servicio no disponible"
      description="Vuelve a intentarlo en unos minutos."
      recovery={recovery}
    />
  )
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('AsyncState', () => {
  it('announces loading once while keeping every skeleton decorative', () => {
    const container = renderState(<AsyncState.Loading label="Cargando perfil" />)
    const status = screen.getByRole('status')
    const skeletons = [...container.querySelectorAll('[data-skeleton]')]

    expect(status.textContent).toContain('Cargando perfil')
    expect(skeletons.length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    for (const skeleton of skeletons) {
      expect(skeleton.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('renders an empty state with semantic hierarchy and optional action', () => {
    renderState(
      <AsyncState.Empty
        title="Sin resultados"
        description="No encontramos contenido para mostrar."
        titleLevel={3}
        action={<Button.Primary>Crear elemento</Button.Primary>}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'Sin resultados' }),
    ).toBeTruthy()
    expect(
      screen.getByText('No encontramos contenido para mostrar.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Crear elemento' })).toBeTruthy()
  })

  it('distinguishes functional error from temporary unavailability', () => {
    renderState(
      <>
        <AsyncState.Error
          title="Error al cargar"
          description="Revisa la información e inténtalo otra vez."
        />
        <AsyncState.Unavailable
          title="Servicio no disponible"
          description="Inténtalo más tarde."
        />
      </>,
    )

    expect(
      screen.getByRole('alert').closest('[data-state]')?.getAttribute('data-state'),
    ).toBe('error')
    expect(
      screen.getByRole('status').closest('[data-state]')?.getAttribute('data-state'),
    ).toBe('unavailable')
  })

  it('runs retry once per click and blocks a second submission while pending', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()
    renderState(<RetryHarness variant="error" onRetry={retry} />)
    const button = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Reintentar',
    })

    await user.click(button)
    await user.click(button)

    expect(retry).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Reintentando...')
  })

  it('runs retry once through native keyboard activation', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()
    renderState(<RetryHarness variant="unavailable" onRetry={retry} />)

    await user.tab()
    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')

    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button').getAttribute('disabled')).not.toBeNull()
  })

  it('renders external-looking state content as text', () => {
    const content = '<img src=x onerror=alert(1)>'
    const container = renderState(
      <AsyncState.Empty
        title={content}
        description={content}
        titleLevel={2}
      />,
    )

    expect(screen.getAllByText(content)).toHaveLength(2)
    expect(container.querySelector('img')).toBeNull()
  })

  it('has no axe violations in representative states', async () => {
    const container = renderState(
      <>
        <AsyncState.Loading label="Cargando contenido" />
        <AsyncState.Empty
          title="Sin contenido"
          description="Todavía no hay elementos."
          titleLevel={2}
        />
        <AsyncState.Error
          title="No pudimos cargar"
          description="Inténtalo nuevamente."
          recovery={{ label: 'Reintentar', onRetry: vi.fn(), state: 'idle' }}
        />
      </>,
    )
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
