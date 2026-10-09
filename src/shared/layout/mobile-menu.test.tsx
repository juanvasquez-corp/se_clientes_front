import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { screen, waitFor, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserRole } from '../../contracts/schemas/user'
import {
  createSessionStore,
  type SessionIdentity,
} from '../../core/session/session-store'
import type { LogoutController } from '../../features/auth/logout-controller'
import { createAppRouter } from '../../app/router/router'
import type { AppRouterContext } from '../../app/router/router-context'
import { AppProviders } from '../../app/providers'
import { createProfileApiStub } from '../../test/profile-api-stub'

const roots: Root[] = []
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'

function identityFor(role: UserRole): SessionIdentity {
  return {
    userUuid: USER_UUID,
    name: 'Ana',
    lastName: 'Torres',
    email: 'ana@example.com',
    phoneNumber: null,
    role,
    isActive: true,
  }
}

function createMobileRouter(role: UserRole, initialEntry: string) {
  const store = createSessionStore()
  store.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  store.getState().completeSession(identityFor(role))
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
  return { logout, router, store }
}

async function renderMobile(role: UserRole, initialEntry: string) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  const fixture = createMobileRouter(role, initialEntry)
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

describe('mobile private navigation', () => {
  it('opens with accessible state, focuses active option, and Escape restores trigger', async () => {
    await renderMobile('superadmin', '/users/new')
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: 'Abrir menú' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe('mobile-navigation-panel')
    const navigation = screen.getByRole('navigation', { name: 'Navegación móvil' })
    expect(document.activeElement).toBe(
      within(navigation).getByRole('link', { name: 'Usuarios' }),
    )

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Navegación móvil' })).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)

    await user.click(trigger)
    await user.click(
      within(
        screen.getByRole('complementary', { name: 'Menú móvil' }),
      ).getByRole('button', { name: 'Cerrar menú' }),
    )
    expect(screen.queryByRole('navigation', { name: 'Navegación móvil' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it.each(['master', 'visualizer'] as const)(
    'renders only profile and logout for mobile %s',
    async (role) => {
      await renderMobile(role, '/profile')
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
      const navigation = screen.getByRole('navigation', { name: 'Navegación móvil' })

      expect(within(navigation).queryByText('Usuarios')).toBeNull()
      expect(within(navigation).getAllByRole('link').map((link) => link.textContent)).toEqual([
        'Mi perfil',
      ])
      expect(within(navigation).getByRole('button', { name: 'Cerrar sesión' })).toBeDefined()
    },
  )

  it('closes after one link navigation and focuses ready main content without scrolling', async () => {
    const { router } = await renderMobile('superadmin', '/users')
    const navigate = vi.spyOn(router, 'navigate')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Navegación móvil' }),
      ).getByRole('link', { name: 'Mi perfil' }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/profile')
      expect(document.activeElement).toBe(screen.getByRole('main'))
    })
    expect(screen.queryByRole('navigation', { name: 'Navegación móvil' })).toBeNull()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('opens the existing logout dialog without invoking logout prematurely', async () => {
    const { logout } = await renderMobile('superadmin', '/users')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const mobileNavigation = screen.getByRole('navigation', {
      name: 'Navegación móvil',
    })

    await user.click(
      within(mobileNavigation).getByRole('button', { name: 'Cerrar sesión' }),
    )

    expect(screen.getByRole('dialog', { name: 'Cerrar sesión' })).toBeDefined()
    expect(logout).not.toHaveBeenCalled()
  })

  it('unmounts an open menu safely when the session stops being authenticated', async () => {
    const { store } = await renderMobile('superadmin', '/users')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.getByRole('navigation', { name: 'Navegación móvil' })).toBeDefined()

    act(() => {
      store.getState().markDead()
    })

    expect(screen.queryByRole('navigation', { name: 'Navegación móvil' })).toBeNull()
  })

  it('has no detectable axe violations while open', async () => {
    const { container } = await renderMobile('superadmin', `/users/${USER_UUID}`)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
