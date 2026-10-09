import { StrictMode, act, useEffect } from 'react'
import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InitialSessionCoordinator } from '../core/session/session-coordinator'
import { createSessionStore } from '../core/session/session-store'
import { SessionBootstrap } from './session-bootstrap'

const roots: Root[] = []

function renderBootstrap(element: React.ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)
  act(() => {
    root.render(element)
  })
  return { container, root }
}

function coordinatorStub(
  restoreInitial: InitialSessionCoordinator['restoreInitial'],
  retryInitial: InitialSessionCoordinator['retryInitial'] = restoreInitial,
): InitialSessionCoordinator {
  return { restoreInitial, retryInitial, cancelInitial: vi.fn() }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('SessionBootstrap', () => {
  it('announces restoration and never mounts private children while unknown', () => {
    const sessionStore = createSessionStore()
    const coordinator = coordinatorStub(() => new Promise(() => undefined))
    const privateMount = vi.fn()
    function PrivateContent() {
      useEffect(privateMount, [])
      return <p>Contenido privado</p>
    }

    renderBootstrap(
      <SessionBootstrap coordinator={coordinator} sessionStore={sessionStore}>
        <PrivateContent />
      </SessionBootstrap>,
    )

    expect(screen.getByRole('status').textContent).toContain('Restaurando sesión')
    expect(screen.queryByText('Contenido privado')).toBeNull()
    expect(privateMount).not.toHaveBeenCalled()
  })

  it('deduplicates the initial restore under StrictMode and reveals children after success', async () => {
    const sessionStore = createSessionStore()
    const privateMount = vi.fn()
    const restoreInitial = vi.fn<InitialSessionCoordinator['restoreInitial']>(() => {
      sessionStore.getState().acceptTokens({
        accessToken: 'access-value',
        tokenType: 'bearer',
        expiresIn: 120,
        csrfToken: 'csrf-value',
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
      return Promise.resolve('authenticated')
    })
    function PrivateContent() {
      useEffect(privateMount, [])
      return <p>Contenido privado</p>
    }

    renderBootstrap(
      <StrictMode>
        <SessionBootstrap
          coordinator={coordinatorStub(restoreInitial)}
          sessionStore={sessionStore}
        >
          <PrivateContent />
        </SessionBootstrap>
      </StrictMode>,
    )

    await waitFor(() => {
      expect(screen.getByText('Contenido privado')).toBeTruthy()
    })
    expect(restoreInitial).toHaveBeenCalledTimes(1)
    expect(privateMount).toHaveBeenCalled()
  })

  it('mounts private children once after a normal successful bootstrap', async () => {
    const sessionStore = createSessionStore()
    const privateMount = vi.fn()
    const restoreInitial = vi.fn<InitialSessionCoordinator['restoreInitial']>(() => {
      sessionStore.getState().acceptTokens({
        accessToken: 'access-value',
        tokenType: 'bearer',
        expiresIn: 120,
        csrfToken: 'csrf-value',
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
      return Promise.resolve('authenticated')
    })
    function PrivateContent() {
      useEffect(privateMount, [])
      return <p>Contenido privado</p>
    }

    renderBootstrap(
      <SessionBootstrap
        coordinator={coordinatorStub(restoreInitial)}
        sessionStore={sessionStore}
      >
        <PrivateContent />
      </SessionBootstrap>,
    )

    await waitFor(() => {
      expect(screen.getByText('Contenido privado')).toBeTruthy()
    })
    expect(privateMount).toHaveBeenCalledTimes(1)
  })

  it('hides children while unavailable and starts one retry per activation', async () => {
    const sessionStore = createSessionStore()
    sessionStore.getState().markRestorationUnavailable()
    const retryInitial = vi.fn<InitialSessionCoordinator['retryInitial']>(() => {
      sessionStore.getState().beginRestoration()
      return Promise.resolve('unavailable')
    })
    const coordinator = coordinatorStub(
      () => Promise.resolve('unavailable'),
      retryInitial,
    )
    const user = userEvent.setup()

    renderBootstrap(
      <SessionBootstrap coordinator={coordinator} sessionStore={sessionStore}>
        <p>Contenido privado</p>
      </SessionBootstrap>,
    )

    expect(screen.queryByText('Contenido privado')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(retryInitial).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Restaurando sesión')
  })

  it('cancels on unmount and late store updates cannot mount private UI', async () => {
    const sessionStore = createSessionStore()
    const coordinator = coordinatorStub(() => new Promise(() => undefined))
    const privateMount = vi.fn()
    function PrivateContent() {
      useEffect(privateMount, [])
      return <p>Contenido privado</p>
    }
    const { root } = renderBootstrap(
      <SessionBootstrap coordinator={coordinator} sessionStore={sessionStore}>
        <PrivateContent />
      </SessionBootstrap>,
    )

    act(() => {
      root.unmount()
    })
    roots.splice(roots.indexOf(root), 1)
    await Promise.resolve()
    act(() => {
      sessionStore.getState().acceptTokens({
        accessToken: 'late-access',
        tokenType: 'bearer',
        expiresIn: 120,
        csrfToken: 'late-csrf',
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

    expect(privateMount).not.toHaveBeenCalled()
    expect(coordinator.cancelInitial).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations while restoration is unavailable', async () => {
    const sessionStore = createSessionStore()
    sessionStore.getState().markRestorationUnavailable()
    const container = renderBootstrap(
      <SessionBootstrap
        coordinator={coordinatorStub(() => Promise.resolve('unavailable'))}
        sessionStore={sessionStore}
      >
        <p>Contenido privado</p>
      </SessionBootstrap>,
    ).container

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
