import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LoginOutcome } from '../../core/session/auth-api'
import { LoginForm } from './login-form'
import type { LoginInput } from './login-schema'

const roots: ReturnType<typeof createRoot>[] = []
const AUTHENTICATED_OUTCOME = {
  kind: 'authenticated',
  identity: {
    userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role: 'master',
    isActive: true,
  },
} as const satisfies LoginOutcome

async function renderLoginForm(
  onSubmit: (input: LoginInput) => Promise<LoginOutcome> = vi.fn(() =>
    Promise.resolve(AUTHENTICATED_OUTCOME),
  ),
) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  await act(async () => {
    root.render(<LoginForm onSubmit={onSubmit} />)
    await Promise.resolve()
  })

  return { container, onSubmit }
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  }
})

describe('LoginForm', () => {
  it('renders only the allowed, persistently labelled login controls', async () => {
    await renderLoginForm()
    const email = screen.getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico.*obligatorio/i,
    })
    const password = screen.getByLabelText<HTMLInputElement>(
      /contraseña.*obligatorio/i,
    )

    expect(email.autocomplete).toBe('username')
    expect(password.autocomplete).toBe('current-password')
    expect(password.type).toBe('password')
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDefined()
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.textContent).not.toMatch(
      /registro|recuperar|olvidé|recordarme|google|facebook/i,
    )
  })

  it('reveals the password only on explicit accessible request', async () => {
    const user = userEvent.setup()
    await renderLoginForm()
    const password = screen.getByLabelText<HTMLInputElement>(
      /contraseña.*obligatorio/i,
    )
    const secret = ' contraseña privada '

    await act(async () => { await user.type(password, secret) })
    const reveal = screen.getByRole('button', { name: 'Mostrar contraseña' })
    expect(reveal.getAttribute('aria-pressed')).toBe('false')

    await act(async () => { await user.click(reveal) })

    expect(password.type).toBe('text')
    expect(password.value).toBe(secret)
    expect(
      screen.getByRole('button', { name: 'Ocultar contraseña' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    expect(document.body.textContent).not.toContain(secret)
  })

  it('announces validation errors, focuses the first invalid field and never submits', async () => {
    const user = userEvent.setup()
    const { onSubmit } = await renderLoginForm()

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Ingresar' })) })

    const email = screen.getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico.*obligatorio/i,
    })
    const emailError = await screen.findByText('Ingresa tu correo electrónico.')
    const passwordError = screen.getByText('Ingresa tu contraseña.')
    expect(document.activeElement).toBe(email)
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toContain(emailError.id)
    expect(passwordError.getAttribute('aria-live')).toBe('polite')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects invalid email and passwords over 128 characters before submit', async () => {
    const user = userEvent.setup()
    const { onSubmit } = await renderLoginForm()
    const email = screen.getByRole('textbox', { name: /correo electrónico/i })
    const password = screen.getByLabelText(/^contraseña.*obligatorio/i)

    await act(async () => { await user.type(email, 'correo-invalido') })
    await act(async () => { await user.type(password, 'a'.repeat(129)) })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Ingresar' })) })

    expect(
      await screen.findByText('Ingresa un correo electrónico válido.'),
    ).toBeDefined()
    expect(
      screen.getByText('La contraseña no puede superar 128 caracteres.'),
    ).toBeDefined()
    expect(document.activeElement).toBe(email)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps one valid submit pending and blocks click or Enter duplicates', async () => {
    let resolveSubmit: ((outcome: LoginOutcome) => void) | undefined
    const onSubmit = vi.fn(
      () =>
        new Promise<LoginOutcome>((resolve) => {
          resolveSubmit = resolve
        }),
    )
    const user = userEvent.setup()
    await renderLoginForm(onSubmit)
    const email = screen.getByRole('textbox', { name: /correo electrónico/i })
    const password = screen.getByLabelText(/^contraseña.*obligatorio/i)

    await act(async () => { await user.type(email, '  ANA@Example.COM  ') })
    await act(async () => { await user.type(password, 'private password') })
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Ingresar' })
    await act(async () => { await user.click(submit) })

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(submit.disabled).toBe(true)
    })
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'private password',
    })
    expect(screen.getByRole('status').textContent).toContain(
      'Validando tus credenciales.',
    )
    expect(screen.getByRole('form').getAttribute('aria-busy')).toBe('true')

    await act(async () => { await user.click(submit) })
    password.focus()
    await act(async () => { await user.keyboard('{Enter}') })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSubmit?.(AUTHENTICATED_OUTCOME)
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(submit.disabled).toBe(false)
    })
  })

  it('has no detectable axe violations with validation feedback', async () => {
    const user = userEvent.setup()
    const { container } = await renderLoginForm()

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Ingresar' })) })
    await screen.findByText('Ingresa tu correo electrónico.')
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
