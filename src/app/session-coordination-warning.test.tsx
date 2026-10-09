import { StrictMode, act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionCoordinationWarning } from './session-coordination-warning'

const roots: ReturnType<typeof createRoot>[] = []

function renderWarning(mode: 'coordinated' | 'limited') {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)
  act(() => {
    root.render(
      <StrictMode>
        <SessionCoordinationWarning mode={mode} />
        <button type="button">Continuar</button>
      </StrictMode>,
    )
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

describe('SessionCoordinationWarning', () => {
  it('announces limited coordination once without blocking interaction', async () => {
    const user = userEvent.setup()
    const click = vi.fn()
    const container = renderWarning('limited')
    const button = screen.getByRole('button', { name: 'Continuar' })
    button.addEventListener('click', click)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toContain(
      'Si usas varias pestañas, una de ellas podría cerrar o invalidar tu sesión.',
    )
    await user.click(button)
    expect(click).toHaveBeenCalledOnce()

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })

  it('renders no warning when full coordination is available', () => {
    renderWarning('coordinated')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
