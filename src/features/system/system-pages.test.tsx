import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InitialRestorationResult } from '../../core/session/session-coordinator'
import {
  createSessionStore,
  type SessionStore,
} from '../../core/session/session-store'
import type { SecurityRecoveryController } from '../auth/security-recovery-controller'
import { createAppRouter } from '../../app/router/router'
import type { AppRouterContext } from '../../app/router/router-context'
import { AppProviders } from '../../app/providers'
import { createProfileApiStub } from '../../test/profile-api-stub'

const roots: Root[] = []
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'

function authenticate(store: SessionStore) {
  store.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  store.getState().completeSession({
    userUuid: USER_UUID,
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role: 'superadmin',
    isActive: true,
  })
}

function securityController(): SecurityRecoveryController {
  return {
    operation: 'refresh',
    restoreProtection: () => Promise.resolve({ kind: 'restored' }),
    retryOriginal: () => Promise.resolve({ kind: 'dispatched' }),
  }
}

function createSystemRouter({
  initialEntry,
  prepareStore,
  retryInitial = () => Promise.resolve<InitialRestorationResult>('unavailable'),
  createSecurityRecoveryController = vi.fn(securityController),
}: {
  initialEntry: '/forbidden' | '/unavailable'
  prepareStore: (store: SessionStore) => void
  retryInitial?: () => Promise<InitialRestorationResult>
  createSecurityRecoveryController?: () => SecurityRecoveryController
}) {
  const store = createSessionStore()
  prepareStore(store)
  const context: AppRouterContext = {
    queryClient: new QueryClient(),
    session: {
      store,
      login: () => Promise.resolve({ kind: 'technical' }),
      logoutController: { logout: () => Promise.resolve({ kind: 'logged-out' }) },
      profileApi: createProfileApiStub(),
      createSecurityRecoveryController,
      coordinator: {
        restoreInitial: () => Promise.resolve('unavailable'),
        retryInitial,
        cancelInitial: () => undefined,
      },
    },
  }
  const router = createAppRouter({
    context,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  return { createSecurityRecoveryController, router, store }
}

async function renderSystemRoute(
  options: Parameters<typeof createSystemRouter>[0],
) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const fixture = createSystemRouter(options)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(
      <StrictMode>
        <AppProviders queryClient={fixture.router.options.context.queryClient}>
          <RouterProvider router={fixture.router} />
        </AppProviders>
      </StrictMode>,
    )
    await fixture.router.load()
  })
  return { container, ...fixture }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  vi.restoreAllMocks()
})

describe('ForbiddenPage', () => {
  it('shows generic access denial without identity or private shell and safely returns to login', async () => {
    const { container, router } = await renderSystemRoute({
      initialEntry: '/forbidden',
      prepareStore: (store) => {
        store.getState().markRestorationForbidden()
      },
    })
    const user = userEvent.setup()

    expect(screen.getByRole('heading', { name: 'Acceso denegado' })).toBeDefined()
    expect(screen.getByRole('alert')).toBeDefined()
    expect(document.body.textContent).not.toMatch(/ana@|uuid|usuarios pendiente/i)
    expect(screen.queryByRole('navigation')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Ir al inicio de sesión' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })

  it('returns an authenticated identity from a manually opened forbidden page to role home', async () => {
    const { router } = await renderSystemRoute({
      initialEntry: '/forbidden',
      prepareStore: authenticate,
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Volver a mi espacio' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/users')
    })
  })

  it('mounts Spec005 security recovery for a blocked session without private content', async () => {
    const createController = vi.fn(securityController)
    await renderSystemRoute({
      initialEntry: '/forbidden',
      prepareStore: (store) => {
        authenticate(store)
        store.getState().markRefreshBlocked()
      },
      createSecurityRecoveryController: createController,
    })

    expect(screen.getByRole('heading', { name: 'Protección de sesión' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Restablecer protección' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Acceso denegado' })).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(createController).toHaveBeenCalled()
  })
})

describe('UnavailablePage', () => {
  it('blocks double retry and follows a dead restoration result to login', async () => {
    let resolveRetry: ((result: InitialRestorationResult) => void) | undefined
    const storeResult = { store: undefined as SessionStore | undefined }
    const retryInitial = vi.fn(
      () =>
        new Promise<InitialRestorationResult>((resolve) => {
          resolveRetry = resolve
        }),
    )
    const { router } = await renderSystemRoute({
      initialEntry: '/unavailable',
      prepareStore: (store) => {
        store.getState().markRestorationUnavailable()
        storeResult.store = store
      },
      retryInitial,
    })
    const user = userEvent.setup()
    const retry = screen.getByRole('button', { name: 'Reintentar' })

    await user.dblClick(retry)
    expect(retryInitial).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Reintentando...' })
        .disabled,
    ).toBe(true)

    await act(async () => {
      storeResult.store?.getState().markDead()
      resolveRetry?.('dead')
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
  })

  it('uses security recovery for unavailable protection and not initial retry', async () => {
    const retryInitial = vi.fn(() => Promise.resolve<InitialRestorationResult>('unavailable'))
    const createController = vi.fn(securityController)
    await renderSystemRoute({
      initialEntry: '/unavailable',
      prepareStore: (store) => {
        authenticate(store)
        store.getState().markRefreshUnavailable()
      },
      retryInitial,
      createSecurityRecoveryController: createController,
    })

    expect(screen.getByRole('heading', { name: 'Protección de sesión' })).toBeDefined()
    expect(retryInitial).not.toHaveBeenCalled()
    expect(createController).toHaveBeenCalled()
  })

  it('remains available for another manual retry after a transient result', async () => {
    const retryInitial = vi.fn(() =>
      Promise.resolve<InitialRestorationResult>('unavailable'),
    )
    const { router } = await renderSystemRoute({
      initialEntry: '/unavailable',
      prepareStore: (store) => {
        store.getState().markRestorationUnavailable()
      },
      retryInitial,
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined()
    })
    expect(retryInitial).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/unavailable')
  })

  it('never presents global unavailable for an operational authenticated identity', async () => {
    const { router } = await renderSystemRoute({
      initialEntry: '/unavailable',
      prepareStore: authenticate,
    })

    expect(router.state.location.pathname).toBe('/users')
    expect(screen.queryByRole('heading', { name: 'Servicio no disponible' })).toBeNull()
  })
})
