import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LogoutController } from '../features/auth/logout-controller'
import type { SecurityRecoveryController } from '../features/auth/security-recovery-controller'
import { createSessionStore } from '../core/session/session-store'
import type { AppRuntime } from './session-runtime'
import { App } from './app'

const roots: Root[] = []

function createRuntime(path = '/') {
  const sessionStore = createSessionStore()
  let currentPath = path
  const listeners = new Set<() => void>()
  const replace = vi.fn((destination: string) => {
    currentPath = destination
    for (const listener of listeners) listener()
  })
  const restoreInitial = vi.fn(() => new Promise<never>(() => undefined))
  const retryInitial = vi.fn(() => Promise.resolve('unavailable' as const))
  const runtime: AppRuntime = {
    sessionStore,
    coordinator: {
      restoreInitial,
      retryInitial,
      cancelInitial: vi.fn(),
    },
    coordinationMode: 'coordinated',
    login: vi.fn(() => Promise.resolve({ kind: 'technical' as const })),
    logoutController: {
      logout: vi.fn(() => Promise.resolve({ kind: 'unavailable' as const })),
    } satisfies LogoutController,
    createSecurityRecoveryController: vi.fn(
      () =>
        ({
          operation: 'refresh',
          restoreProtection: () => Promise.resolve({ kind: 'blocked' }),
          retryOriginal: () => Promise.resolve({ kind: 'not-ready' }),
        }) satisfies SecurityRecoveryController,
    ),
    navigation: {
      currentPath: () => currentPath,
      replace(destination) {
        replace(destination)
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    close: vi.fn(),
  }
  return { replace, restoreInitial, runtime, sessionStore }
}

function authenticate(
  sessionStore: ReturnType<typeof createSessionStore>,
  role: 'superadmin' | 'master' | 'visualizer',
) {
  sessionStore.getState().acceptTokens({
    accessToken: 'fixture-access',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'fixture-csrf',
  })
  sessionStore.getState().acceptIdentity({
    userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role,
    isActive: true,
  })
}

function renderApp(runtime: AppRuntime) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)
  act(() => {
    root.render(
      <StrictMode>
        <App runtime={runtime} />
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

describe('real application session shell', () => {
  it.each(['/', '/login', '/unavailable', '/profile', '/unknown'])(
    'restores before rendering route content on an initial %s load',
    (path) => {
      const { restoreInitial, runtime } = createRuntime(path)
      renderApp(runtime)

      expect(restoreInitial).toHaveBeenCalledOnce()
      expect(screen.getByRole('status').textContent).toContain(
        'Restaurando sesión',
      )
      expect(screen.queryByRole('heading', { name: 'Inicia sesión' })).toBeNull()
      expect(
        screen.queryByRole('heading', { name: 'Contenido privado' }),
      ).toBeNull()
    },
  )

  it('starts restoration at the root and hides private content until authentication', () => {
    const { restoreInitial, runtime, sessionStore } = createRuntime()
    renderApp(runtime)

    expect(restoreInitial).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('Restaurando sesión')
    expect(screen.queryByRole('heading', { name: 'Contenido privado' })).toBeNull()

    act(() => {
      sessionStore.getState().acceptTokens({
        accessToken: 'fixture-access',
        tokenType: 'bearer',
        expiresIn: 120,
        csrfToken: 'fixture-csrf',
      })
      sessionStore.getState().acceptIdentity({
        userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
        name: 'Ana',
        lastName: null,
        email: 'ana@example.com',
        phoneNumber: null,
        role: 'master',
        isActive: true,
      })
    })

    expect(screen.getByRole('heading', { name: 'Contenido privado' })).toBeTruthy()
  })

  it.each([
    ['superadmin', '/users'],
    ['master', '/profile'],
    ['visualizer', '/profile'],
  ] as const)('renders only an authorized %s private route at %s', (role, path) => {
    const { replace, runtime, sessionStore } = createRuntime(path)
    authenticate(sessionStore, role)
    renderApp(runtime)

    expect(screen.getByRole('heading', { name: 'Contenido privado' })).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it.each([
    ['superadmin', '/', '/users'],
    ['superadmin', '/login', '/users'],
    ['master', '/unavailable', '/profile'],
    ['master', '/forbidden', '/profile'],
    ['visualizer', '/unknown', '/profile'],
    ['master', '/users', '/profile'],
  ] as const)(
    'redirects authenticated %s from %s to %s',
    (role, path, destination) => {
      const { replace, runtime, sessionStore } = createRuntime(path)
      authenticate(sessionStore, role)
      renderApp(runtime)

      expect(replace).toHaveBeenCalledOnce()
      expect(replace).toHaveBeenCalledWith(destination)
    },
  )

  it('renders the real login page on the session login route', () => {
    const { runtime, sessionStore } = createRuntime('/login')
    sessionStore.getState().markDead()
    renderApp(runtime)

    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Contenido privado' })).toBeNull()
  })

  it('renders security recovery on forbidden', () => {
    const blocked = createRuntime('/forbidden')
    blocked.sessionStore.getState().acceptTokens({
      accessToken: 'fixture-access',
      tokenType: 'bearer',
      expiresIn: 120,
      csrfToken: 'fixture-csrf',
    })
    blocked.sessionStore.getState().acceptIdentity({
      userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
      name: 'Ana',
      lastName: null,
      email: 'ana@example.com',
      phoneNumber: null,
      role: 'master',
      isActive: true,
    })
    blocked.sessionStore.getState().markRefreshBlocked()
    renderApp(blocked.runtime)

    expect(screen.getByRole('heading', { name: 'Protección de sesión' })).toBeTruthy()
    expect(screen.queryByText('ana@example.com')).toBeNull()
  })

  it('renders manual restoration retry on unavailable', () => {
    const unavailable = createRuntime('/unavailable')
    unavailable.sessionStore.getState().markRestorationUnavailable()
    renderApp(unavailable.runtime)

    expect(screen.getByRole('status').textContent).toContain(
      'Servicio no disponible',
    )
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Contenido privado' })).toBeNull()
  })
})
