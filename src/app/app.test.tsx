import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppRuntime } from './session-runtime'
import { createSessionStore } from '../core/session/session-store'
import { createProfileApiStub } from '../test/profile-api-stub'
import { createUsersApiStub } from '../test/users-api-stub'
import { createAppRouter } from './router/router'
import type { AppRouterContext } from './router/router-context'
import { App } from './app'

const roots: Root[] = []
const routers: ReturnType<typeof createAppRouter>[] = []
let loginPreloaded = false

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
    usersApi: createUsersApiStub(),
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
      usersApi: runtime.usersApi,
      createSecurityRecoveryController: runtime.createSecurityRecoveryController,
      coordinator: runtime.coordinator,
    },
  }
  const router = createAppRouter({
    context,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  routers.push(router)
  return { restoreInitial, router, runtime }
}

function disposeRouters() {
  for (const router of routers.splice(0)) {
    router.history.destroy()
    router.options.context.queryClient.clear()
  }
}

async function preloadLogin() {
  const { router } = createFixture('/login')
  try {
    const component = router.routesById['/login'].options.component
    if (component === undefined || typeof component.preload !== 'function') {
      throw new Error('Expected preloadable /login component.')
    }
    await component.preload()
    loginPreloaded = true
  } finally {
    disposeRouters()
  }
}

await preloadLogin()

async function renderApp(fixture: ReturnType<typeof createFixture>) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(
      <StrictMode>
        <App router={fixture.router} runtime={fixture.runtime} />
      </StrictMode>,
    )
    await fixture.router.load()
  })
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.all(routers.map((router) => router.options.context.queryClient.cancelQueries()))
  })
  disposeRouters()
  vi.restoreAllMocks()
})

describe('application router composition', () => {
  it('mounts the real router and resolves root through one restoration', async () => {
    expect(loginPreloaded).toBe(true)
    const fixture = createFixture('/')
    await renderApp(fixture)

    await screen.findByRole('heading', { name: 'Inicia sesión' })

    expect(fixture.restoreInitial).toHaveBeenCalledTimes(1)
    expect(fixture.router.state.location.pathname).toBe('/login')
    expect(screen.queryByText('Contenido privado')).toBeNull()
  })

  it('routes an unknown dead-session path to login without a functional wildcard', async () => {
    const fixture = createFixture('/dashboard')
    await renderApp(fixture)

    await screen.findByRole('heading', { name: 'Inicia sesión' })

    expect(fixture.router.state.location.pathname).toBe('/login')
    expect(Object.hasOwn(fixture.router.routesById, '/$')).toBe(false)
  })

  it('closes runtime once after the StrictMode app is finally unmounted', async () => {
    const fixture = createFixture('/login')
    fixture.runtime.sessionStore.getState().markDead()
    await renderApp(fixture)
    await screen.findByRole('heading', { name: 'Inicia sesión' })

    await act(async () => {
      for (const root of roots.splice(0)) root.unmount()
      await Promise.resolve()
    })

    expect(fixture.runtime.close).toHaveBeenCalledTimes(1)
  })
})
