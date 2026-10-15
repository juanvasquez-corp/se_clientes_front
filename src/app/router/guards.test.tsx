import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserRole } from '../../contracts/schemas/user'
import {
  createSessionStore,
  type SessionIdentity,
  type SessionStore,
} from '../../core/session/session-store'
import { createProfileApiStub } from '../../test/profile-api-stub'
import { createUsersApiStub } from '../../test/users-api-stub'
import { createAppRouter } from './router'
import type { AppRouterContext } from './router-context'
import { AppProviders } from '../providers'

const roots: Root[] = []
const routers: ReturnType<typeof createAppRouter>[] = []
const lazyPaths = ['/users', '/users/new', '/users/$userUuid', '/users/$userUuid/edit', '/profile', '/login', '/forbidden', '/unavailable'] as const
const preloadedPaths: string[] = []
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'

function identityFor(role: UserRole): SessionIdentity {
  return {
    userUuid: USER_UUID,
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role,
    isActive: true,
  }
}

function authenticate(store: SessionStore, role: UserRole) {
  store.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  store.getState().completeSession(identityFor(role))
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value)
    },
  }
}

function createGuardTestRouter({
  initialEntry,
  store = createSessionStore(),
  restoreInitial = vi.fn(() => Promise.resolve<'dead'>('dead')),
}: {
  initialEntry: string
  store?: SessionStore
  restoreInitial?: AppRouterContext['session']['coordinator']['restoreInitial']
}) {
  const context: AppRouterContext = {
    queryClient: new QueryClient(),
    session: {
      store,
      login: () => Promise.resolve({ kind: 'technical' }),
      logoutController: { logout: () => Promise.resolve({ kind: 'logged-out' }) },
      profileApi: createProfileApiStub(),
      usersApi: createUsersApiStub(),
      createSecurityRecoveryController: () => ({
        operation: 'refresh',
        restoreProtection: () => Promise.resolve({ kind: 'restored' }),
        retryOriginal: () => Promise.resolve({ kind: 'dispatched' }),
      }),
      coordinator: {
        restoreInitial,
        retryInitial: () => Promise.resolve('dead'),
        cancelInitial: () => undefined,
      },
    },
  }
  const history = createMemoryHistory({ initialEntries: [initialEntry] })
  const router = createAppRouter({ context, history })
  routers.push(router)
  return {
    history,
    restoreInitial,
    router,
    store,
  }
}

function disposeRouters() {
  for (const router of routers.splice(0)) {
    router.history.destroy()
    router.options.context.queryClient.clear()
  }
}

async function preloadComponents() {
  const { router } = createGuardTestRouter({ initialEntry: '/login' })
  try {
    for (const path of lazyPaths) {
      const component = router.routesById[path].options.component
      if (component === undefined || typeof component.preload !== 'function') {
        throw new Error(`Expected preloadable ${path} component.`)
      }
      await component.preload()
      preloadedPaths.push(path)
    }
  } finally {
    disposeRouters()
  }
}

await preloadComponents()

async function loadPath(
  initialEntry: string,
  prepareStore?: (store: SessionStore) => void,
) {
  const store = createSessionStore()
  prepareStore?.(store)
  const testRouter = createGuardTestRouter({ initialEntry, store })
  await testRouter.router.load()
  return testRouter
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.all(routers.map((router) => router.options.context.queryClient.cancelQueries()))
  })
  disposeRouters()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('private route guards', () => {
  it('waits for the shared restore promise and never renders private content early', async () => {
    expect(preloadedPaths).toEqual(lazyPaths)
    const deferred = createDeferred<'authenticated'>()
    const store = createSessionStore()
    const restoreInitial = vi.fn(() => deferred.promise)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const { router } = createGuardTestRouter({
      initialEntry: '/users',
      store,
      restoreInitial,
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(
        <StrictMode>
          <AppProviders queryClient={router.options.context.queryClient}>
            <RouterProvider router={router} />
          </AppProviders>
        </StrictMode>,
      )
      await Promise.resolve()
    })

    expect(restoreInitial).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Usuarios pendiente')).toBeNull()

    await act(async () => {
      authenticate(store, 'superadmin')
      deferred.resolve('authenticated')
      await router.load()
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gestión de usuarios' }),
    ).toBeDefined()
    expect(restoreInitial).toHaveBeenCalledTimes(1)
  })

  it.each(['/profile', '/users', `/users/${USER_UUID}`])(
    'redirects a dead session requesting %s to login with replacement',
    async (path) => {
      const { router, history } = await loadPath(path, (store) => {
        store.getState().markDead()
      })

      expect(router.state.location.pathname).toBe('/login')
      expect(history.length).toBe(1)
    },
  )

  it.each([
    ['unavailable', '/unavailable'],
    ['forbidden', '/forbidden'],
    ['blocked', '/forbidden'],
  ] as const)('redirects %s private identity to %s', async (status, destination) => {
    const { router } = await loadPath('/profile', (store) => {
      if (status === 'unavailable') {
        store.getState().markRestorationUnavailable()
      } else if (status === 'forbidden') {
        store.getState().markRestorationForbidden()
      } else {
        authenticate(store, 'superadmin')
        store.getState().markRefreshBlocked()
      }
    })

    expect(router.state.location.pathname).toBe(destination)
  })

  it.each(['master', 'visualizer'] as const)(
    'redirects every users descendant requested by %s to forbidden',
    async (role) => {
      for (const path of [
        '/users',
        '/users/new',
        `/users/${USER_UUID}`,
        `/users/${USER_UUID}/edit`,
      ]) {
        const { router } = await loadPath(path, (store) => {
          authenticate(store, role)
        })
        expect(router.state.location.pathname).toBe('/forbidden')
      }
    },
  )

  it.each([
    ['superadmin', '/profile'],
    ['master', '/profile'],
    ['visualizer', '/profile'],
    ['superadmin', '/users'],
    ['superadmin', '/users/new'],
    ['superadmin', `/users/${USER_UUID}`],
    ['superadmin', `/users/${USER_UUID}/edit`],
  ] as const)('allows %s to remain on %s', async (role, path) => {
    const { router } = await loadPath(path, (store) => {
      authenticate(store, role)
    })
    expect(router.state.location.pathname).toBe(path)
  })
})

describe('technical root and unknown path guard', () => {
  it.each([
    ['superadmin', '/', '/users'],
    ['master', '/', '/profile'],
    ['visualizer', '/', '/profile'],
    ['superadmin', '/dashboard', '/forbidden'],
    ['master', '/register', '/forbidden'],
  ] as const)('resolves authenticated %s at %s to %s', async (role, path, expected) => {
    const { router } = await loadPath(path, (store) => {
      authenticate(store, role)
    })
    expect(router.state.location.pathname).toBe(expected)
  })

  it.each(['/', '/dashboard', '/register', '/users/not-a-uuid'])(
    'resolves dead identity at unknown/root %s to login',
    async (path) => {
      const { router } = await loadPath(path, (store) => {
        store.getState().markDead()
      })
      expect(router.state.location.pathname).toBe('/login')
    },
  )
})

describe('login and controlled-state guards', () => {
  it('waits for initial restoration before allowing a dead session on login', async () => {
    const store = createSessionStore()
    const restoreInitial = vi.fn(() => {
      store.getState().markDead()
      return Promise.resolve<'dead'>('dead')
    })
    const { router } = createGuardTestRouter({
      initialEntry: '/login',
      store,
      restoreInitial,
    })

    await router.load()

    expect(restoreInitial).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/login')
  })

  it.each([
    ['superadmin', '/users'],
    ['master', '/profile'],
    ['visualizer', '/profile'],
  ] as const)('redirects authenticated %s from login to %s without return input', async (role, home) => {
    const { router, history } = await loadPath(
      '/login?return=https%3A%2F%2Fevil.example%2Fsteal',
      (store) => {
        authenticate(store, role)
      },
    )

    expect(router.state.location.pathname).toBe(home)
    expect(router.state.location.search).toEqual({})
    expect(history.length).toBe(1)
  })

  it('allows a dead session to stay on login', async () => {
    const { router } = await loadPath('/login', (store) => {
      store.getState().markDead()
    })
    expect(router.state.location.pathname).toBe('/login')
  })

  it.each([
    ['unavailable', '/unavailable'],
    ['forbidden', '/forbidden'],
    ['blocked', '/forbidden'],
  ] as const)('redirects %s identity away from login to %s', async (status, destination) => {
    const { router } = await loadPath('/login', (store) => {
      if (status === 'unavailable') store.getState().markRestorationUnavailable()
      if (status === 'forbidden') store.getState().markRestorationForbidden()
      if (status === 'blocked') {
        authenticate(store, 'master')
        store.getState().markRefreshBlocked()
      }
    })
    expect(router.state.location.pathname).toBe(destination)
  })

  it('waits once on initial restoration at forbidden without a redirect loop', async () => {
    const store = createSessionStore()
    const restoreInitial = vi.fn(() => {
      store.getState().markDead()
      return Promise.resolve<'dead'>('dead')
    })
    const { router } = createGuardTestRouter({
      initialEntry: '/forbidden',
      store,
      restoreInitial,
    })

    await router.load()

    expect(restoreInitial).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/forbidden')
  })

  it('sends dead identity away from unavailable after one initial restoration', async () => {
    const store = createSessionStore()
    const restoreInitial = vi.fn(() => {
      store.getState().markDead()
      return Promise.resolve<'dead'>('dead')
    })
    const { router } = createGuardTestRouter({
      initialEntry: '/unavailable',
      store,
      restoreInitial,
    })

    await router.load()

    expect(restoreInitial).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/login')
  })
})
