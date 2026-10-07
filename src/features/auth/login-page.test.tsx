/// <reference types="node" />

import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LoginOutcome } from '../../core/session/auth-api'
import { createSessionStore } from '../../core/session/session-store'
import type { LoginInput } from './login-schema'
import { LoginPage } from './login-page'

const roots: ReturnType<typeof createRoot>[] = []
const loginPageCssPath = resolve('src/features/auth/login-page.css')
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

function renderLoginPage() {
  const onSubmit = vi.fn<(input: LoginInput) => Promise<LoginOutcome>>(() =>
    Promise.resolve(AUTHENTICATED_OUTCOME),
  )
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(
      <LoginPage
        navigation={{ replace: vi.fn() }}
        onSubmit={onSubmit}
        sessionStore={createSessionStore()}
      />,
    )
  })

  return { container, onSubmit }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('LoginPage', () => {
  it('composes one semantic branded login page without extra capabilities', () => {
    const { container } = renderLoginPage()
    const main = screen.getByRole('main')
    const logo = screen.getByRole<HTMLImageElement>('img', { name: 'Aliar S.A.' })

    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(main.classList.contains('login-page')).toBe(true)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Inicia sesión' }),
    ).toBeDefined()
    expect(screen.getByText('Ingresa tus credenciales para continuar.')).toBeDefined()
    expect(screen.getByRole('form', { name: 'Inicio de sesión' })).toBeDefined()
    expect(logo.getAttribute('src')).toBe('/assets/aliar-logo.svg')
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.textContent).not.toMatch(
      /registro|recuperar|olvidé|cambiar contraseña|acceso social|recordarme|dashboard/i,
    )
  })

  it('declares approved desktop and mobile backgrounds only through CSS media queries', async () => {
    const loginPageStyles = await readFile(loginPageCssPath, 'utf8')

    expect(loginPageStyles).toContain('url("/assets/login-background.webp")')
    expect(loginPageStyles).toContain(
      'url("/assets/login-background-mobile.webp")',
    )
    expect(loginPageStyles).toMatch(/@media\s+\(max-width:/)
    expect(loginPageStyles).toContain('var(--aliar-white)')
    expect(loginPageStyles).toContain('var(--shadow-floating)')
    expect(loginPageStyles).not.toMatch(/#[\da-f]{3,8}/i)
  })

  it('has no detectable axe violations', async () => {
    const { container } = renderLoginPage()
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
