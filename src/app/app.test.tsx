import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppRuntime } from './session-runtime'
import { createSessionStore } from '../core/session/session-store'
import { createProfileApiStub } from '../test/profile-api-stub'
import { createAppRouter } from './router/router'
import type { AppRouterContext } from './router/router-context'
import { App } from './app'

const roots: Root[] = []

function createFixture(initialEntry: string) {
  const sessionStore = createSessionStore()
  const restoreInitial = vi.fn(() => {
    sessionStore.getState().markDead()
    return Promise.resolve<'dead'>('dead')
  })
  const runtime = {
    sessionStore,
    coordinator: {
      restoreInitial,
      retryInitial: () => Promise.resolve<'dead'>('dead'),
      cancelInitial: vi.fn(),
    },
    coordinationMode: 'coordinated',
    login: vi.fn(() => Promise.resolve({ kind: 'technical' as const })),
    logoutController: {
      logout: vi.fn(() => Promise.resolve({ kind: 'unavailable' as const })),
    },
    profileApi: createProfileApiStub(),
    createSecurityRecoveryController: vi.fn(() => ({
      operation: 'refresh' as const,
      restoreProtection: () => Promise.resolve({ kind: 'blocked' as const }),
      retryOriginal: () => Promise.resolve({ kind: 'not-ready' as const }),
    })),
    navigation: {
      currentPath: () => initialEntry,
      replace: vi.fn(),
      subscribe: () => () => undefined,
    },
    close: vi.fn(),
  } satisfies AppRuntime
  const context: AppRouterContext = {
    queryClient: new QueryClient(),
    session: {
      store: sessionStore,
      login: runtime.login,
      logoutController: runtime.logoutController,
      profileApi: runtime.profileApi,
      createSecurityRecoveryController: runtime.createSecurityRecoveryController,
      coordinator: runtime.coordinator,
    },
  }
  const router = createAppRouter({
    context,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  return { restoreInitial, router, runtime }
}

function renderApp(fixture: ReturnType<typeof createFixture>) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <StrictMode>
        <App router={fixture.router} runtime={fixture.runtime} />
      </StrictMode>,
    )
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  vi.restoreAllMocks()
})

describe('application router composition', () => {
  it('mounts the real router and resolves root through one restoration', async () => {
    const fixture = createFixture('/')
    renderApp(fixture)

    await screen.findByRole('heading', { name: 'Inicia sesión' })

    expect(fixture.restoreInitial).toHaveBeenCalledTimes(1)
    expect(fixture.router.state.location.pathname).toBe('/login')
    expect(screen.queryByText('Contenido privado')).toBeNull()
  })

  it('routes an unknown dead-session path to login without a functional wildcard', async () => {
    const fixture = createFixture('/dashboard')
    renderApp(fixture)

    await screen.findByRole('heading', { name: 'Inicia sesión' })

    expect(fixture.router.state.location.pathname).toBe('/login')
    expect(Object.hasOwn(fixture.router.routesById, '/$')).toBe(false)
  })

  it('closes runtime once after the StrictMode app is finally unmounted', async () => {
    const fixture = createFixture('/login')
    fixture.runtime.sessionStore.getState().markDead()
    renderApp(fixture)
    await screen.findByRole('heading', { name: 'Inicia sesión' })

    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount()
      })
    }
    await Promise.resolve()

    expect(fixture.runtime.close).toHaveBeenCalledTimes(1)
  })
})
