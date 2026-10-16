import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act } from 'react'
import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { screen, waitFor, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  UserDetailBreadcrumb,
  type DetailBreadcrumbViewport,
} from './user-detail-breadcrumb'
import { detailBreadcrumb } from './user-management'

const TARGET_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const roots: Root[] = []
const histories: ReturnType<typeof createMemoryHistory>[] = []

async function renderBreadcrumb({
  currentLabel,
  viewport,
}: {
  readonly currentLabel?: string
  readonly viewport?: DetailBreadcrumbViewport
} = {}) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const rootRoute = createRootRoute({ component: Outlet })
  const usersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'users',
    component: Outlet,
  })
  const usersIndexRoute = createRoute({
    getParentRoute: () => usersRoute,
    path: '/',
    component: () => <h1>Gestión de usuarios</h1>,
  })
  const userDetailRoute = createRoute({
    getParentRoute: () => usersRoute,
    path: '$userUuid',
    component: () => (
      <main>
        <UserDetailBreadcrumb currentLabel={currentLabel} viewport={viewport} />
      </main>
    ),
  })
  const routeTree = rootRoute.addChildren([
    usersRoute.addChildren([usersIndexRoute, userDetailRoute]),
  ])
  const history = createMemoryHistory({
    initialEntries: [`/users/${TARGET_UUID}`],
  })
  histories.push(history)
  const router = createRouter({
    routeTree,
    history,
  })

  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  await act(async () => {
    await router.load()
    root.render(<RouterProvider router={router} />)
  })

  return { container, router }
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.resolve()
  })
  for (const history of histories.splice(0)) history.destroy()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('detailBreadcrumb pure helper', () => {
  it('returns the full hierarchical desktop model inside Usuarios', () => {
    expect(detailBreadcrumb('desktop', 'Carlos Ramírez')).toEqual({
      kind: 'desktop',
      parentLabel: 'Usuarios',
      parentHref: '/users',
      currentLabel: 'Carlos Ramírez',
    })
  })

  it('returns the compact mobile return model inside Usuarios', () => {
    expect(detailBreadcrumb('mobile', 'Carlos Ramírez')).toEqual({
      kind: 'mobile',
      backLabel: 'Volver a usuarios',
      backHref: '/users',
      currentLabel: 'Carlos Ramírez',
    })
  })

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['public UUID', TARGET_UUID],
    ['uppercase UUID', TARGET_UUID.toUpperCase()],
    ['numeric cedula', '1023456789'],
  ])('falls back safely to "Detalle de usuario" when currentLabel is %s', (_case, rawLabel) => {
    expect(detailBreadcrumb('desktop', rawLabel).currentLabel).toBe('Detalle de usuario')
    expect(detailBreadcrumb('mobile', rawLabel).currentLabel).toBe('Detalle de usuario')
  })
})

describe('UserDetailBreadcrumb', () => {
  it('renders semantic desktop breadcrumb navigation with a link to /users and aria-current="page"', async () => {
    const { container, router } = await renderBreadcrumb({
      currentLabel: 'Carlos Ramírez',
      viewport: 'desktop',
    })

    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    const parentLink = within(nav).getByRole('link', { name: 'Usuarios' })
    const currentItem = within(nav).getByText('Carlos Ramírez')
    const iconUse = container.querySelector('svg use')

    expect(nav.getAttribute('data-breadcrumb-viewport')).toBe('desktop')
    expect(parentLink.getAttribute('href')).toBe('/users')
    expect(parentLink.className).toContain('min-h-11')
    expect(currentItem.getAttribute('aria-current')).toBe('page')
    expect(iconUse?.getAttribute('href')).toBe('/assets/icons.svg#icon-chevron-right')

    const user = userEvent.setup()
    await act(async () => {
      await user.click(parentLink)
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/users')
    })
  })

  it('renders compact mobile return navigation with 44px touch target and navigates back to /users', async () => {
    const { container, router } = await renderBreadcrumb({
      currentLabel: 'Carlos Ramírez',
      viewport: 'mobile',
    })

    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    const backLink = within(nav).getByRole('link', { name: 'Volver a usuarios' })
    const currentItem = within(nav).getByText('Carlos Ramírez')
    const iconUse = container.querySelector('svg use')

    expect(nav.getAttribute('data-breadcrumb-viewport')).toBe('mobile')
    expect(backLink.getAttribute('href')).toBe('/users')
    expect(backLink.className).toContain('min-h-11')
    expect(backLink.className).toContain('min-w-11')
    expect(currentItem.getAttribute('aria-current')).toBe('page')
    expect(iconUse?.getAttribute('href')).toBe('/assets/icons.svg#icon-chevron-right')

    const user = userEvent.setup()
    await act(async () => {
      await user.click(backLink)
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/users')
    })
  })

  it('adapts automatically between desktop and mobile viewports when viewport prop is omitted', async () => {
    const originalWidth = window.innerWidth
    try {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1024,
      })

      await renderBreadcrumb({ currentLabel: 'Carlos Ramírez' })

      const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
      expect(nav.getAttribute('data-breadcrumb-viewport')).toBe('desktop')
      expect(within(nav).getByRole('link', { name: 'Usuarios' })).toBeTruthy()

      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          writable: true,
          value: 375,
        })
        window.dispatchEvent(new Event('resize'))
      })

      expect(nav.getAttribute('data-breadcrumb-viewport')).toBe('mobile')
      expect(within(nav).getByRole('link', { name: 'Volver a usuarios' })).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalWidth,
      })
    }
  })

  it('never exposes UUID or cedula and escapes HTML-like strings in the current label', async () => {
    const maliciousLabel = '<img src=x onerror=alert(1)><b>Nombre</b>'
    const { container } = await renderBreadcrumb({
      currentLabel: maliciousLabel,
      viewport: 'desktop',
    })

    expect(screen.getByText(maliciousLabel)).toBeTruthy()
    expect(container.querySelector('img, b, script')).toBeNull()
    expect(container.textContent).not.toContain(TARGET_UUID)
  })

  it.each(['desktop', 'mobile'] as const)(
    'has 0 axe accessibility violations in %s mode',
    async (viewport) => {
      const { container } = await renderBreadcrumb({
        currentLabel: 'Carlos Ramírez',
        viewport,
      })

      const results = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      })

      expect(results.violations).toEqual([])
    },
  )
})
