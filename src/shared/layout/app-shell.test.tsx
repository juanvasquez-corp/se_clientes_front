import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { screen, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserRole } from '../../contracts/schemas/user'
import {
  createSessionStore,
  type SessionIdentity,
} from '../../core/session/session-store'
import type { LogoutController } from '../../features/auth/logout-controller'
import { isUsersContext } from '../../app/router/navigation-policy'
import { createAppRouter } from '../../app/router/router'
import type { AppRouterContext } from '../../app/router/router-context'
import { AppProviders } from '../../app/providers'
import { createProfileApiStub } from '../../test/profile-api-stub'
import { createUsersApiStub } from '../../test/users-api-stub'

const roots: Root[] = []
const routers: ReturnType<typeof createAppRouter>[] = []
const lazyPaths = ['/users', '/users/new', '/users/$userUuid', '/users/$userUuid/edit', '/profile'] as const
const preloadedPaths: string[] = []
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'

function identityFor(role: UserRole): SessionIdentity {
  return {
    userUuid: USER_UUID,
    name: 'Ana',
    lastName: 'Torres',
    email: 'ana.torres@example.com',
    phoneNumber: null,
    role,
    isActive: true,
  }
}

function createShellRouter(role: UserRole, initialEntry: string) {
  const store = createSessionStore()
  const identity = identityFor(role)
  store.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  store.getState().completeSession(identity)
  const logout = vi.fn<LogoutController['logout']>(() =>
    Promise.resolve({ kind: 'logged-out' }),
  )
  const context: AppRouterContext = {
    queryClient: new QueryClient(),
    session: {
      store,
      login: () => Promise.resolve({ kind: 'technical' }),
      logoutController: { logout },
      profileApi: createProfileApiStub(),
      usersApi: createUsersApiStub(),
      createSecurityRecoveryController: () => ({
        operation: 'refresh',
        restoreProtection: () => Promise.resolve({ kind: 'restored' }),
        retryOriginal: () => Promise.resolve({ kind: 'dispatched' }),
      }),
      coordinator: {
        restoreInitial: () => Promise.resolve('authenticated'),
        retryInitial: () => Promise.resolve('authenticated'),
        cancelInitial: () => undefined,
      },
    },
  }
  const router = createAppRouter({
    context,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  routers.push(router)
  return { logout, router }
}

function disposeRouters() {
  for (const router of routers.splice(0)) {
    router.history.destroy()
    router.options.context.queryClient.clear()
  }
}

async function preloadComponents() {
  const { router } = createShellRouter('superadmin', '/users')
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

async function renderShell(role: UserRole, initialEntry: string) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const { logout, router } = createShellRouter(role, initialEntry)
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
  return { container, logout, router }
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.all(routers.map((router) => router.options.context.queryClient.cancelQueries()))
  })
  disposeRouters()
  vi.restoreAllMocks()
})

describe('private AppShell navigation', () => {
  it.each([
    '/users-old',
    '/users/',
    '/users/not-a-uuid',
    `/users/${USER_UUID}/extra`,
    `/users/${USER_UUID}?tab=profile`,
    `/users/${USER_UUID}#detail`,
    '/unknown',
  ])('does not activate Usuarios for deceptive pathname %s', (pathname) => {
    expect(isUsersContext(pathname)).toBe(false)
  })

  it('renders the exact superadmin menu and active users module', async () => {
    expect(preloadedPaths).toEqual(lazyPaths)
    await renderShell('superadmin', '/users/new')
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })

    expect(within(navigation).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Usuarios',
      'Mi perfil',
    ])
    expect(
      within(navigation)
        .getByRole('link', { name: 'Usuarios' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      within(navigation)
        .getByRole('link', { name: 'Mi perfil' })
        .hasAttribute('aria-current'),
    ).toBe(false)
    expect(within(navigation).getByRole('button', { name: 'Cerrar sesión' })).toBeDefined()
  })

  it.each(['master', 'visualizer'] as const)(
    'omits Usuarios from the %s DOM and activates only profile',
    async (role) => {
      await renderShell(role, '/profile')
      const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })

      expect(within(navigation).queryByText('Usuarios')).toBeNull()
      expect(within(navigation).getAllByRole('link')).toHaveLength(1)
      expect(
        within(navigation)
          .getByRole('link', { name: 'Mi perfil' })
          .getAttribute('aria-current'),
      ).toBe('page')
      expect(within(navigation).getByRole('button', { name: 'Cerrar sesión' })).toBeDefined()
    },
  )

  it.each([
    '/users',
    '/users/new',
    `/users/${USER_UUID}`,
    `/users/${USER_UUID}/edit`,
  ])('keeps Usuarios active on valid context %s', async (path) => {
    await renderShell('superadmin', path)
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(
      within(navigation).getByRole('link', { name: 'Usuarios' }).getAttribute('aria-current'),
    ).toBe('page')
  })

  it('uses the logout action as a button that opens the existing dialog', async () => {
    const { logout } = await renderShell('superadmin', '/users')
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: 'Cerrar sesión' })

    expect(trigger.closest('a')).toBeNull()
    await act(async () => { await user.click(trigger) })

    expect(screen.getByRole('dialog', { name: 'Cerrar sesión' })).toBeDefined()
    expect(logout).not.toHaveBeenCalled()
  })

  it('keeps semantic content, minimal identity and keyboard order accessible', async () => {
    const { container } = await renderShell('superadmin', '/users')
    const user = userEvent.setup()
    const main = screen.getByRole('main')

    expect(main.id).toBe('main-content')
    expect(screen.getAllByRole('img', { name: 'Aliar S.A.' })).toHaveLength(2)
    expect(screen.getByText('Ana Torres')).toBeDefined()
    expect(document.body.textContent).not.toContain('ana.torres@example.com')
    expect(document.body.textContent).not.toContain(USER_UUID)

    await act(async () => { await user.tab() })
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Usuarios' }))
    await act(async () => { await user.tab() })
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Mi perfil' }))
    await act(async () => { await user.tab() })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar sesión' }))

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
