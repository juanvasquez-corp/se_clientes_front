import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { HttpResponse, delay, http } from 'msw'
import { screen, waitFor, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { createApiClient, type RecoveryResult } from '../../core/http/api-client'
import { server } from '../../test/server'
import { createUsersApi } from './users-api'
import { UserDetailPage, type UserDetailPageProps } from './user-detail-page'

const API_BASE_URL = 'https://api.example.test/api'
const USERS_URL = `${API_BASE_URL}/users`
const ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const OTHER_DETAIL_URL = `${USERS_URL}/${OTHER_UUID}`
const SELF_DETAIL_URL = `${USERS_URL}/${ACCOUNT_UUID}`

const OTHER_USER: UserResponse = {
  uuid: OTHER_UUID,
  name: 'Carlos',
  last_name: 'Ramírez',
  email: 'carlos.ramirez@example.com',
  phone_number: '+57 310 555 0199',
  role: 'master',
  is_active: true,
}

const SELF_USER: UserResponse = {
  uuid: ACCOUNT_UUID,
  name: 'Ana',
  last_name: 'Gómez',
  email: 'ana.gomez@example.com',
  phone_number: null,
  role: 'superadmin',
  is_active: true,
}

const roots: Root[] = []
const queryClients: QueryClient[] = []
const histories: ReturnType<typeof createMemoryHistory>[] = []

beforeEach(() => {
  notifyManager.setNotifyFunction((notify) => {
    act(notify)
  })
})

afterEach(async () => {
  try {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount()
      vi.restoreAllMocks()
      await Promise.all(queryClients.map((client) => client.cancelQueries()))
    })
    for (const history of histories.splice(0)) history.destroy()
    for (const client of queryClients.splice(0)) client.clear()
    document.body.innerHTML = ''
  } finally {
    notifyManager.setNotifyFunction((notify) => {
      notify()
    })
  }
})

function createTestUsersApi(recovery: RecoveryResult = 'dead') {
  return createUsersApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'detail-page-access-token',
      sessionRecovery: { recoverRead: () => Promise.resolve(recovery) },
    }),
  })
}

async function renderUserDetailPage(
  overrides: Partial<UserDetailPageProps> = {},
) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 3 } },
  })
  queryClients.push(queryClient)

  const props: UserDetailPageProps = {
    accountUuid: ACCOUNT_UUID,
    currentUserUuid: ACCOUNT_UUID,
    userUuid: OTHER_UUID,
    usersApi: createTestUsersApi(),
    onToggleStatus: vi.fn(),
    onDeleteUser: vi.fn(),
    onSessionState: vi.fn(),
    ...overrides,
  }

  const initialPath = `/users/${encodeURIComponent(props.userUuid)}`
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
  const detailRoute = createRoute({
    getParentRoute: () => usersRoute,
    path: '$userUuid',
    component: () => (
      <main>
        <UserDetailPage {...props} />
      </main>
    ),
  })
  const editRoute = createRoute({
    getParentRoute: () => detailRoute,
    path: 'edit',
    component: () => <h1>Editar usuario</h1>,
  })
  const unavailableRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'unavailable',
    component: () => <h1>Servicio no disponible global</h1>,
  })

  const history = createMemoryHistory({ initialEntries: [initialPath] })
  histories.push(history)
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      usersRoute.addChildren([
        usersIndexRoute,
        detailRoute.addChildren([editRoute]),
      ]),
      unavailableRoute,
    ]),
    history,
  })

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)

  await act(async () => {
    await router.load()
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    )
  })

  return { container, props, queryClient, router }
}

describe('UserDetailPage', () => {
  it('shows localized loading state while keeping administrative header and breadcrumb operable', async () => {
    server.use(
      http.get(OTHER_DETAIL_URL, async () => {
        await delay('infinite')
        return HttpResponse.json(OTHER_USER)
      }),
    )

    const { container } = await renderUserDetailPage()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Detalle de usuario' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('navigation', { name: 'Ruta de navegación' }),
    ).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(
      'Cargando detalle de usuario',
    )
    expect(container.querySelector('[data-state="loading"]')).toBeTruthy()
  })

  it('renders breadcrumb, public card and third-party actions when the target account exists, with 1 GET under StrictMode', async () => {
    let requests = 0
    server.use(
      http.get(OTHER_DETAIL_URL, () => {
        requests += 1
        return HttpResponse.json(OTHER_USER)
      }),
    )

    const { container } = await renderUserDetailPage()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Carlos Ramírez' }),
    ).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(within(nav).getByText('Carlos Ramírez').getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByText('carlos.ramirez@example.com')).toBeTruthy()
    expect(screen.getByText('+57 310 555 0199')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Editar usuario' }).getAttribute('href')).toBe(
      `/users/${OTHER_UUID}/edit`,
    )
    expect(screen.getByRole('button', { name: 'Desactivar usuario' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Eliminar usuario' })).toBeTruthy()
    expect(requests).toBe(1)

    const axeResults = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(axeResults.violations).toEqual([])
  })

  it('hides status and delete actions and displays self-restriction notice when viewing own account (RF-6)', async () => {
    server.use(http.get(SELF_DETAIL_URL, () => HttpResponse.json(SELF_USER)))

    await renderUserDetailPage({ userUuid: ACCOUNT_UUID })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ana Gómez' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Editar usuario' }).getAttribute('href')).toBe(
      `/users/${ACCOUNT_UUID}/edit`,
    )
    expect(screen.queryByRole('button', { name: /activar|desactivar|eliminar/iu })).toBeNull()
    expect(
      screen.getByText(
        'Tu rol y tu estado no pueden modificarse desde tu propia cuenta, ni puedes eliminarla.',
      ),
    ).toBeTruthy()
  })

  it('renders contextual not-found state with back link to /users when backend responds 404 (RF-7)', async () => {
    let requests = 0
    server.use(
      http.get(OTHER_DETAIL_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'not found' }, { status: 404 })
      }),
    )

    const { container, router } = await renderUserDetailPage()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Usuario no encontrado' }),
    ).toBeTruthy()
    expect(requests).toBe(1)
    expect(router.state.location.pathname).toBe(`/users/${OTHER_UUID}`)
    expect(container.textContent).not.toContain(OTHER_UUID)

    const backLinks = screen.getAllByRole('link', { name: /volver a usuarios/iu })
    const backLink = backLinks[0]
    if (backLink === undefined) throw new Error('Expected BackToUsersLink.')

    const axeResults = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(axeResults.violations).toEqual([])

    const user = userEvent.setup()
    await act(async () => {
      await user.click(backLink)
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/users')
    })
  })

  it('renders contextual not-found state with 0 HTTP requests when userUuid is invalid (RF-7)', async () => {
    let requests = 0
    server.use(
      http.get(`${USERS_URL}/*`, () => {
        requests += 1
        return HttpResponse.json(OTHER_USER)
      }),
    )

    const { container } = await renderUserDetailPage({ userUuid: '1023456789' })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Usuario no encontrado' }),
    ).toBeTruthy()
    expect(requests).toBe(0)
    expect(container.textContent).not.toContain('1023456789')
  })

  it.each(['503', 'network'] as const)(
    'keeps detail route on %s failure, offers controlled manual retry and loads the user on 200 without navigating to /unavailable',
    async (failureMode) => {
      let attempt = 0
      let releaseRetry: (() => void) | undefined
      const retryGate = new Promise<void>((resolve) => {
        releaseRetry = resolve
      })

      server.use(
        http.get(OTHER_DETAIL_URL, async () => {
          attempt += 1
          if (attempt === 1) {
            return failureMode === '503'
              ? HttpResponse.json({ detail: 'unavailable' }, { status: 503 })
              : HttpResponse.error()
          }
          await retryGate
          return HttpResponse.json(OTHER_USER)
        }),
      )

      const { container, router } = await renderUserDetailPage()

      expect(await screen.findByText('Detalle no disponible')).toBeTruthy()
      expect(router.state.location.pathname).toBe(`/users/${OTHER_UUID}`)
      expect(attempt).toBe(1)

      const axeResults = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(axeResults.violations).toEqual([])

      const user = userEvent.setup()
      const retryButton = screen.getByRole('button', { name: 'Reintentar' })
      await act(async () => {
        await user.click(retryButton)
      })

      expect(
        screen.getByRole('button', { name: 'Reintentando...' }),
      ).toHaveProperty('disabled', true)
      expect(attempt).toBe(2)

      await act(async () => {
        releaseRetry?.()
        await retryGate
      })

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Carlos Ramírez' }),
      ).toBeTruthy()
      expect(router.state.location.pathname).toBe(`/users/${OTHER_UUID}`)
    },
  )

  it('shows contextual access denied feedback on 403', async () => {
    server.use(
      http.get(OTHER_DETAIL_URL, () =>
        HttpResponse.json({ detail: 'forbidden' }, { status: 403 }),
      ),
    )

    await renderUserDetailPage()

    expect(await screen.findByText('Acceso denegado')).toBeTruthy()
    expect(
      screen.getByText('No tienes permisos para consultar el detalle de este usuario.'),
    ).toBeTruthy()
  })

  it('shows controlled technical error with retry when backend response violates public contract', async () => {
    server.use(
      http.get(OTHER_DETAIL_URL, () =>
        HttpResponse.json({ ...OTHER_USER, document_number: '1023456789' }),
      ),
    )

    const { container } = await renderUserDetailPage()

    expect(
      await screen.findByText('No pudimos cargar el detalle del usuario'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(container.textContent).not.toContain('1023456789')
  })

  it('notifies onSessionState once when a 401 read ends in a session failure state', async () => {
    server.use(
      http.get(OTHER_DETAIL_URL, () =>
        HttpResponse.json({ detail: 'expired' }, { status: 401 }),
      ),
    )
    const onSessionState = vi.fn()

    await renderUserDetailPage({
      usersApi: createTestUsersApi('dead'),
      onSessionState,
    })

    await waitFor(() => {
      expect(onSessionState).toHaveBeenCalledTimes(1)
      expect(onSessionState).toHaveBeenCalledWith('dead')
    })
  })
})
