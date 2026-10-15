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
const histories: ReturnType<typeof createMemoryHistory>[] = []

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.resolve()
  })
  for (const history of histories.splice(0)) history.destroy()
  vi.restoreAllMocks()
})

describe('router error recovery', () => {
  it('contains a rejected lazy import in an accessible generic fallback', async () => {
    const sensitiveFailure =
      'ChunkLoadError: https://private.example/token-value/login-route.js'
    const failure = new Error(sensitiveFailure)
    const caughtErrors: unknown[] = []
    const rootRoute = createRootRoute({ component: Outlet })
    const failedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'failed',
      component: lazyRouteComponent(() =>
        Promise.reject(failure),
      ),
    })
    const history = createMemoryHistory({
      initialEntries: ['/failed?token=secret#private-fragment'],
    })
    histories.push(history)
    const router = createRouter({
      routeTree: rootRoute.addChildren([failedRoute]),
      history,
      defaultErrorComponent: RouterErrorState,
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })
    const container = document.createElement('div')
    document.body.append(container)
    // El error deliberado se verifica por la API pública; console.error no se intercepta.
    const root = createRoot(container, {
      onCaughtError: (error) => { caughtErrors.push(error) },
    })
    roots.push(root)
    await act(async () => {
      await router.load()
      root.render(<RouterProvider router={router} />)
    })

    const heading = await screen.findByRole('heading', {
      name: 'No pudimos cargar esta página',
    })
    const alert = screen.getByRole('alert')
    const recovery = screen.getByRole('link', { name: 'Recargar página' })

    expect(caughtErrors).toEqual([failure])
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
