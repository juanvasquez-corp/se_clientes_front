import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LoginOutcome } from '../../core/session/auth-api'
import {
  createSessionStore,
  type SessionIdentity,
} from '../../core/session/session-store'
import type { UserRole } from '../../contracts/schemas/user'
import { LoginPage } from './login-page'
import {
  homeForRole,
  UnsupportedUserRoleError,
  type LoginNavigationPort,
} from './login-navigation'
import type { LoginInput } from './login-schema'

const roots: ReturnType<typeof createRoot>[] = []

function identityFor(role: UserRole): SessionIdentity {
  return {
    userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role,
    isActive: true,
  }
}

function authenticateStore(role: UserRole) {
  const sessionStore = createSessionStore()
  sessionStore.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  sessionStore.getState().completeSession(identityFor(role))
  return sessionStore
}

function renderLoginPage({
  navigation,
  onSubmit,
  sessionStore = createSessionStore(),
}: {
  navigation: LoginNavigationPort
  onSubmit: (input: LoginInput) => Promise<LoginOutcome>
  sessionStore?: ReturnType<typeof createSessionStore>
}) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(
      <StrictMode>
        <LoginPage
          navigation={navigation}
          onSubmit={onSubmit}
          sessionStore={sessionStore}
        />
      </StrictMode>,
    )
  })

  return { container, sessionStore }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('homeForRole', () => {
  it.each([
    ['superadmin', '/users'],
    ['master', '/profile'],
    ['visualizer', '/profile'],
  ] as const)('maps %s to the normative destination %s', (role, destination) => {
    expect(homeForRole(role)).toBe(destination)
  })

  it('rejects an unsupported role without a fallback destination', () => {
    const invalidRole = 'operator' as UserRole

    expect(() => homeForRole(invalidRole)).toThrow(UnsupportedUserRoleError)
  })
})

describe('LoginPage navigation port', () => {
  it.each([
    ['superadmin', '/users'],
    ['master', '/profile'],
    ['visualizer', '/profile'],
  ] as const)(
    'replaces login once for an existing %s session without flashing the form',
    (role, destination) => {
      const replace = vi.fn()

      renderLoginPage({
        navigation: { replace },
        onSubmit: () => Promise.resolve({ kind: 'technical' }),
        sessionStore: authenticateStore(role),
      })

      expect(screen.queryByRole('form', { name: 'Inicio de sesión' })).toBeNull()
      expect(replace).toHaveBeenCalledTimes(1)
      expect(replace).toHaveBeenCalledWith(destination)
    },
  )

  it('keeps an anonymous session on login without navigating', () => {
    const replace = vi.fn()

    renderLoginPage({
      navigation: { replace },
      onSubmit: () => Promise.resolve({ kind: 'technical' }),
    })

    expect(screen.getByRole('form', { name: 'Inicio de sesión' })).toBeDefined()
    expect(replace).not.toHaveBeenCalled()
  })

  it('waits for validated identity, then navigates once after successful login', async () => {
    let resolveLogin: ((outcome: LoginOutcome) => void) | undefined
    const sessionStore = createSessionStore()
    const replace = vi.fn()
    const onSubmit = vi.fn(
      () =>
        new Promise<LoginOutcome>((resolve) => {
          resolveLogin = resolve
        }),
    )
    const user = userEvent.setup()
    renderLoginPage({ navigation: { replace }, onSubmit, sessionStore })

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'ana@example.com',
    )
    await user.type(screen.getByLabelText(/^contraseña.*obligatorio/i), 'password')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole('form', { name: 'Inicio de sesión' })).toBeDefined()

    const identity = identityFor('superadmin')
    await act(async () => {
      resolveLogin?.({ kind: 'authenticated', identity })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(replace).toHaveBeenCalledTimes(1)
      expect(replace).toHaveBeenCalledWith('/users')
      expect(screen.queryByRole('form', { name: 'Inicio de sesión' })).toBeNull()
    })
  })

  it('does not navigate when profile validation fails', async () => {
    const replace = vi.fn()
    const user = userEvent.setup()
    renderLoginPage({
      navigation: { replace },
      onSubmit: () => Promise.resolve({ kind: 'technical' }),
    })

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'ana@example.com',
    )
    await user.type(screen.getByLabelText(/^contraseña.*obligatorio/i), 'password')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByText('No fue posible completar el inicio de sesión. Intenta de nuevo.')

    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole('form', { name: 'Inicio de sesión' })).toBeDefined()
  })
})
