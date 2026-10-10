import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { screen } from '@testing-library/dom'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RouterErrorState } from './router-error-state'

const roots: Root[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  vi.restoreAllMocks()
})

describe('router error recovery', () => {
  it('contains a rejected lazy import in an accessible generic fallback', async () => {
    const sensitiveFailure =
      'ChunkLoadError: https://private.example/token-value/login-route.js'
    const rootRoute = createRootRoute({ component: Outlet })
    const failedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'failed',
      component: lazyRouteComponent(() =>
        Promise.reject(new Error(sensitiveFailure)),
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([failedRoute]),
      history: createMemoryHistory({
        initialEntries: ['/failed?token=secret#private-fragment'],
      }),
      defaultErrorComponent: RouterErrorState,
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    act(() => {
      root.render(<RouterProvider router={router} />)
    })

    const heading = await screen.findByRole('heading', {
      name: 'No pudimos cargar esta página',
    })
    const alert = screen.getByRole('alert')
    const recovery = screen.getByRole('link', { name: 'Recargar página' })

    expect(heading).toBe(document.activeElement)
    expect(alert.textContent).toContain(
      'Ocurrió un problema al descargar el contenido. Recarga la página para intentarlo nuevamente.',
    )
    expect(alert.textContent).not.toContain(sensitiveFailure)
    expect(alert.textContent).not.toMatch(/token-value|private-fragment|contenido privado/iu)
    expect(recovery.getAttribute('href')).toBe('/failed')
    expect(recovery.getAttribute('target')).toBeNull()
    expect(recovery.getAttribute('rel')).toBeNull()
  })
})
