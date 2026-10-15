import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserRole } from '../../contracts/schemas/user'
import type { LoginOutcome } from '../../core/session/auth-api'
import {
  createSessionStore,
  type SessionIdentity,
  type SessionStore,
} from '../../core/session/session-store'
import type { LoginInput } from '../../features/auth/login-schema'
import { createProfileApiStub } from '../../test/profile-api-stub'
import { createUsersApiStub } from '../../test/users-api-stub'
import './login-route'
import { createAppRouter } from './router'
import type { AppRouterContext } from './router-context'
import { AppProviders } from '../providers'

const roots: Root[] = []
const fixtures: {
  history: ReturnType<typeof createMemoryHistory>
  router: ReturnType<typeof createAppRouter>
  unsubscribe: () => void
}[] = []
const preloadedDestinations: string[] = []
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

function authenticate(store: SessionStore, identity: SessionIdentity) {
  store.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  store.getState().completeSession(identity)
}

function createLoginRouter({
  initialEntry,
  role,
  existingSession = false,
}: {
  initialEntry: string
  role: UserRole
  existingSession?: boolean
}) {
  const store = createSessionStore()
  const identity = identityFor(role)
  if (existingSession) authenticate(store, identity)
  else store.getState().markDead()

  const login = vi.fn<(input: LoginInput) => Promise<LoginOutcome>>(() => {
    authenticate(store, identity)
    return Promise.resolve({ kind: 'authenticated', identity })
  })
  const context: AppRouterContext = {
    queryClient: new QueryClient(),
    session: {
      store,
      login,
      logoutController: { logout: () => Promise.resolve({ kind: 'logged-out' }) },
      profileApi: createProfileApiStub(),
      usersApi: createUsersApiStub(),
      createSecurityRecoveryController: () => ({
        operation: 'refresh',
        restoreProtection: () => Promise.resolve({ kind: 'restored' }),
        retryOriginal: () => Promise.resolve({ kind: 'dispatched' }),
      }),
      coordinator: {
        restoreInitial: () => Promise.resolve('dead'),
        retryInitial: () => Promise.resolve('dead'),
        cancelInitial: () => undefined,
      },
    },
  }
  const history = createMemoryHistory({ initialEntries: [initialEntry] })
  const router = createAppRouter({ context, history })
  const renderedPaths: string[] = []
  const unsubscribe = router.subscribe('onRendered', ({ toLocation }) => {
    renderedPaths.push(toLocation.pathname)
  })
  fixtures.push({ history, router, unsubscribe })
  return { history, login, router, renderedPaths }
}

function disposeFixtures() {
  for (const { history, router, unsubscribe } of fixtures.splice(0)) {
    unsubscribe()
    history.destroy()
    router.options.context.queryClient.clear()
  }
}

async function preloadDestinationComponents(): Promise<void> {
  const { router } = createLoginRouter({ initialEntry: '/login', role: 'superadmin' })
  try {
    for (const path of ['/login', '/profile', '/users'] as const) {
      const component = router.routesById[path].options.component
      if (component === undefined || typeof component.preload !== 'function') {
        throw new Error(`Expected preloadable ${path} component.`)
      }
      const preload = vi.spyOn(component, 'preload')
      try {
        await component.preload()
        if (preload.mock.calls.length === 1) preloadedDestinations.push(path)
      } finally {
        preload.mockRestore()
      }
    }
  } finally {
    disposeFixtures()
  }
}

// Preparación de módulos, sin ejecutar guards ni sembrar datos remotos.
await preloadDestinationComponents()

async function renderRouter(router: ReturnType<typeof createAppRouter>) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    await router.load()
    root.render(
      <StrictMode>
        <AppProviders queryClient={router.options.context.queryClient}>
          <RouterProvider router={router} />
        </AppProviders>
      </StrictMode>,
    )
  })
}

afterEach(async () => {
  try {
    for (const { router } of fixtures) {
      expect(router.state.status).toBe('idle')
      expect(router.state.isLoading).toBe(false)
    }
  } finally {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount()
      await Promise.all(fixtures.map(({ router }) =>
        router.options.context.queryClient.cancelQueries(),
      ))
    })
    disposeFixtures()
    vi.restoreAllMocks()
  }
})

describe('login route integration', () => {
  it.each([
    ['superadmin', '/users'],
    ['master', '/profile'],
    ['visualizer', '/profile'],
  ] as const)('navigates validated %s login exactly once to %s', async (role, home) => {
    const { login, router, renderedPaths } = createLoginRouter({
      initialEntry: '/login?returnTo=https%3A%2F%2Fevil.example#ignored',
      role,
    })
    const navigate = vi.spyOn(router, 'navigate')
    await renderRouter(router)
    const user = userEvent.setup()

    await act(async () => {
      await user.type(
        screen.getByRole('textbox', { name: /correo electrónico/i }),
        'ana@example.com',
      )
      await user.type(screen.getByLabelText(/^contraseña.*obligatorio/i), 'password')
      await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(home)
    })
    expect(login).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(router.state.status).toBe('idle')
    expect(router.state.resolvedLocation?.pathname).toBe(home)
    expect(renderedPaths.at(-1)).toBe(home)
    expect(router.state.location.search).toEqual({})
    expect(router.state.location.hash).toBe('')
  })

  it.each([
    '?redirect=https%3A%2F%2Fevil.example%2Fsteal',
    '?returnTo=%2Fusers%2Fnew',
    '?next=%2F%2Fevil.example',
    '?return=%252Fusers%252Fnew&next=%2Fprofile&next=https%3A%2F%2Fevil.example',
    '#/users/new',
    '#https://evil.example/steal',
  ])('discards login destination input %s for an existing session', async (suffix) => {
    const { history, router } = createLoginRouter({
      initialEntry: `/login${suffix}`,
      role: 'master',
      existingSession: true,
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/profile')
    expect(router.state.location.search).toEqual({})
    expect(router.state.location.hash).toBe('')
    expect(history.length).toBe(1)
  })

  it('does not flash the login form for an existing authenticated session', async () => {
    expect(preloadedDestinations).toEqual(['/login', '/profile', '/users'])
    const { router, renderedPaths } = createLoginRouter({
      initialEntry: '/login?next=/profile',
      role: 'superadmin',
      existingSession: true,
    })

    await renderRouter(router)

    expect(screen.queryByRole('form', { name: 'Inicio de sesión' })).toBeNull()
    expect(router.state.location.pathname).toBe('/users')
    expect(router.state.resolvedLocation?.pathname).toBe('/users')
    expect(renderedPaths.at(-1)).toBe('/users')
  })
})
