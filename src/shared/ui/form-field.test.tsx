import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it } from 'vitest'

import { FormField } from './form-field'

const roots: ReturnType<typeof createRoot>[] = []

function renderField(field: React.ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(field)
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

describe('FormField', () => {
  it('associates a persistent required label and help with its control', () => {
    renderField(
      <FormField
        id="email"
        label="Correo electrónico"
        requirement="required"
        help="Usa tu correo corporativo."
        control={<input type="email" />}
      />,
    )
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico.*obligatorio/i,
    })
    const label = screen.getByText('Correo electrónico', { exact: false })
    const help = screen.getByText('Usa tu correo corporativo.')

    expect(label.getAttribute('for')).toBe('email-control')
    expect(input.id).toBe('email-control')
    expect(input.required).toBe(true)
    expect(input.getAttribute('aria-describedby')).toBe('email-help')
    expect(help.id).toBe('email-help')
    expect(input.hasAttribute('aria-invalid')).toBe(false)
  })

  it('connects visible validation text and exposes invalid state', () => {
    renderField(
      <FormField
        id="email"
        label="Correo electrónico"
        requirement="required"
        help="Usa tu correo corporativo."
        validation={{
          status: 'error',
          message: 'Ingresa un correo electrónico válido.',
        }}
        control={<input type="email" />}
      />,
    )
    const input = screen.getByRole<HTMLInputElement>('textbox')
    const error = screen.getByText('Ingresa un correo electrónico válido.')

    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(
      'email-help email-error',
    )
    expect(error.id).toBe('email-error')
    expect(error.getAttribute('aria-live')).toBe('polite')
    expect(error.textContent).not.toBe('')
  })
})
