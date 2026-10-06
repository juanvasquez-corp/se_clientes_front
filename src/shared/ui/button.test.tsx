import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from './button'

const roots: ReturnType<typeof createRoot>[] = []

function renderButton(button: React.ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(button)
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

describe('Button', () => {
  it.each([
    [<Button.Primary key="primary">Guardar</Button.Primary>, 'Guardar'],
    [<Button.Secondary key="secondary">Cancelar</Button.Secondary>, 'Cancelar'],
    [
      <Button.Destructive key="destructive">Eliminar</Button.Destructive>,
      'Eliminar',
    ],
  ])('renders explicit text variants as native 44px buttons', (control, name) => {
    renderButton(control)
    const button = screen.getByRole('button', { name })

    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('min-h-11')).toBe(true)
    expect(button.classList.contains('min-w-11')).toBe(true)
  })

  it('activates through native Enter and Space keyboard behavior', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    renderButton(<Button.Primary onClick={handleClick}>Guardar</Button.Primary>)
    const button = screen.getByRole('button', { name: 'Guardar' })

    await user.tab()
    expect(document.activeElement).toBe(button)

    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(handleClick).toHaveBeenCalledTimes(2)
  })

  it('preserves native disabled behavior', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    renderButton(
      <Button.Primary disabled onClick={handleClick}>
        Guardar
      </Button.Primary>,
    )
    const button = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Guardar',
    })

    await user.click(button)

    expect(button.disabled).toBe(true)
    expect(handleClick).not.toHaveBeenCalled()
    expect(button.classList.contains('disabled:cursor-not-allowed')).toBe(true)
  })

  it('requires one accessible button name and hides its approved icon', () => {
    const container = renderButton(
      <Button.Icon icon="icon-edit" label="Editar usuario" />,
    )
    const button = screen.getByRole('button', { name: 'Editar usuario' })
    const svg = button.querySelector('svg')

    expect(button.textContent).toBe('')
    expect(button.classList.contains('size-11')).toBe(true)
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.hasAttribute('aria-label')).toBe(false)
    expect(container.querySelector('use')?.getAttribute('href')).toBe(
      '/assets/icons.svg#icon-edit',
    )
  })
})
