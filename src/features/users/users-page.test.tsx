import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { HttpResponse, delay, http } from 'msw'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { createApiClient, type SessionFailureState } from '../../core/http/api-client'
import { server } from '../../test/server'
import { createUsersApi } from './users-api'
import { UsersPage, type UsersPageProps } from './users-page'

const API_BASE_URL = 'https://api.example.test/api'
const USERS_URL = `${API_BASE_URL}/users`
const SEARCH_URL = `${USERS_URL}/search`
const ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const USER = {
  uuid: OTHER_UUID,
  name: 'Ana',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: null,
  rol: 'master',
  is_active: true,
} as const

const roots: Root[] = []
const queryClients: QueryClient[] = []
const histories: ReturnType<typeof createMemoryHistory>[] = []

beforeEach(() => {
  // Adaptador de notificaciones recomendado por Query para tests; conserva el scheduler real.
  notifyManager.setNotifyFunction((notify) => { act(notify) })
})

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

function pageResponse(
  page: number,
  data: readonly UserResponse[] = [USER],
  totalRecords = 21,
) {
  return {
    total_records: totalRecords,
    current_page: page,
    total_pages: Math.max(1, Math.ceil(totalRecords / 10)),
    page_size: 10,
    data,
  }
}

function createTestUsersApi() {
  return createUsersApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'users-page-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
    }),
  })
}

async function renderUsersPage(
  overrides: Partial<UsersPageProps> = {},
) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 3 } } })
  queryClients.push(queryClient)
  const props: UsersPageProps = {
    accountUuid: ACCOUNT_UUID,
    currentUserUuid: ACCOUNT_UUID,
    usersApi: createTestUsersApi(),
    actionPolicy: {
      kind: 'available',
      ports: {
        onChangeStatus: vi.fn(),
        onDelete: vi.fn(),
      },
    },
    onSessionOutcome: vi.fn(),
    ...overrides,
  }
  const rootRoute = createRootRoute({ component: Outlet })
  const usersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <UsersPage {...props} />,
  })
  const createRouteNode = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/new',
    component: () => <p>Creación de usuario</p>,
  })
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$userUuid',
    component: () => <p>Detalle</p>,
  })
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$userUuid/edit',
    component: () => <p>Edición</p>,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  histories.push(history)
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      usersRoute,
      createRouteNode,
      detailRoute,
      editRoute,
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
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  })
  return { container, props, queryClient, router }
}

afterEach(async () => {
  try {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount()
      vi.restoreAllMocks()
      await Promise.all(queryClients.map((client) => client.cancelQueries()))
    })
    for (const history of histories.splice(0)) history.destroy()
    for (const client of queryClients.splice(0)) client.clear()
  } finally {
    notifyManager.setNotifyFunction((notify) => { notify() })
  }
})

describe('UsersPage', () => {
  it('renders a successful list with persistent header, create action and pagination', async () => {
    server.use(http.get(USERS_URL, () => HttpResponse.json(pageResponse(1))))
    await renderUsersPage()

    expect(await screen.findByRole('table', { name: 'Directorio de usuarios' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Gestión de usuarios' })).toBeTruthy()
    const create = screen.getByRole('link', { name: 'Crear usuario' })
    expect(create.getAttribute('href')).toBe('/users/new')
    expect(screen.getByRole('navigation', { name: 'Paginación de usuarios' })).toBeTruthy()
    expect(screen.getByText('21 registros')).toBeTruthy()
  })

  it('shows a valid empty list with the same create action in header and state', async () => {
    server.use(http.get(USERS_URL, () => HttpResponse.json(pageResponse(1, [], 0))))
    await renderUsersPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'No hay usuarios registrados' }))
      .toBeTruthy()
    const createLinks = screen.getAllByRole('link', { name: 'Crear usuario' })
    expect(createLinks).toHaveLength(2)
    expect(createLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/users/new',
      '/users/new',
    ])
    expect(screen.queryByRole('navigation', { name: 'Paginación de usuarios' })).toBeNull()
  })

  it('keeps header, create and search operable around one localized loading announcement', async () => {
    server.use(
      http.get(USERS_URL, async () => {
        await delay('infinite')
        return HttpResponse.json(pageResponse(1))
      }),
    )
    const { container } = await renderUsersPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Gestión de usuarios' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Crear usuario' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /correo electrónico/iu })).not.toHaveProperty('disabled', true)
    expect(screen.getByRole('status').textContent).toContain('Cargando directorio de usuarios')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(container.querySelector('[data-state="loading"]')).toBeTruthy()
  })

  it('replaces only the result region with a skeleton while changing pages and discards old data', async () => {
    let releaseSecond: (() => void) | undefined
    const secondAllowed = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    server.use(
      http.get(USERS_URL, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        if (page === 2) await secondAllowed
        return HttpResponse.json({
          ...pageResponse(page),
          data: [{ ...USER, name: page === 1 ? 'Primera página' : 'Segunda página' }],
        })
      }),
    )
    await renderUsersPage()
    expect(await screen.findByText('Primera página')).toBeTruthy()
    const user = userEvent.setup()

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Página siguiente' })) })

    expect(await screen.findByText('Cargando directorio de usuarios')).toBeTruthy()
    expect(screen.queryByText('Primera página')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Gestión de usuarios' })).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Buscar usuario por correo' })).toBeTruthy()
    await act(async () => {
      releaseSecond?.()
      await secondAllowed
    })
    expect(await screen.findByText('Segunda página')).toBeTruthy()
    expect(screen.getByText('Página 2 de 3')).toBeTruthy()
  })

  it('lets only the latest inverse page/search/clear transition commit UI state', async () => {
    server.use(
      http.get(USERS_URL, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json({
          ...pageResponse(page),
          data: [{ ...USER, name: `Lista ${String(page)}` }],
        })
      }),
      http.post(SEARCH_URL, async ({ request }) => {
        const body = await request.json() as { email: string }
        return HttpResponse.json({ ...USER, email: body.email })
      }),
    )
    const { queryClient } = await renderUsersPage()
    await screen.findByText('Lista 1')
    const transitions = [
      createDeferred<undefined>(),
      createDeferred<undefined>(),
      createDeferred<undefined>(),
      createDeferred<undefined>(),
    ]
    const cancel = vi.spyOn(queryClient, 'cancelQueries')
    for (const transition of transitions) {
      cancel.mockImplementationOnce(() => transition.promise)
    }
    const user = userEvent.setup()
    const email = screen.getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico/iu,
    })

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Página siguiente' })) })
    await act(async () => { await user.type(email, 'bea@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })
    await act(async () => {
      transitions[1]?.resolve(undefined)
      await transitions[1]?.promise
    })
    expect(await screen.findAllByText('bea@example.com')).toHaveLength(2)
    await act(async () => {
      transitions[0]?.resolve(undefined)
      await transitions[0]?.promise
    })
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
    expect(screen.queryByText('Lista 2')).toBeNull()

    await act(async () => { await user.clear(email) })
    await act(async () => { await user.type(email, 'ana@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Limpiar' })) })
    await act(async () => {
      transitions[3]?.resolve(undefined)
      await transitions[3]?.promise
    })
    expect(await screen.findByText('Lista 2')).toBeTruthy()
    await act(async () => {
      transitions[2]?.resolve(undefined)
      await transitions[2]?.promise
    })

    expect(screen.getByText('Lista 2')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
    expect(email.value).toBe('')
    await waitFor(() => {
      expect(document.activeElement).toBe(email)
    })
  })

  it('does not let a stale clear steal focus after a newer search commits', async () => {
    server.use(
      http.get(USERS_URL, () => HttpResponse.json(pageResponse(1))),
      http.post(SEARCH_URL, async ({ request }) => {
        const body = await request.json() as { email: string }
        return HttpResponse.json({ ...USER, email: body.email })
      }),
    )
    const { queryClient } = await renderUsersPage()
    await screen.findByRole('table')
    const user = userEvent.setup()
    const email = screen.getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico/iu,
    })
    await act(async () => { await user.type(email, 'ana@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })
    await screen.findAllByText('ana@example.com')
    const clearTransition = createDeferred<undefined>()
    const searchTransition = createDeferred<undefined>()
    const cancel = vi.spyOn(queryClient, 'cancelQueries')
    cancel.mockImplementationOnce(() => clearTransition.promise)
    cancel.mockImplementationOnce(() => searchTransition.promise)

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Limpiar' })) })
    await act(async () => { await user.type(email, 'bea@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })
    await act(async () => {
      searchTransition.resolve(undefined)
      await searchTransition.promise
    })
    expect(await screen.findAllByText('bea@example.com')).toHaveLength(2)
    const createLink = screen.getByRole('link', { name: 'Crear usuario' })
    createLink.focus()

    await act(async () => {
      clearTransition.resolve(undefined)
      await clearTransition.promise
    })

    expect(document.activeElement).toBe(createLink)
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
  })

  it('corrects an out-of-range page to the last valid page exactly once', async () => {
    const requestedPages: number[] = []
    server.use(
      http.get(USERS_URL, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        requestedPages.push(page)
        if (page === 3) return HttpResponse.json(pageResponse(3, [], 20))
        return HttpResponse.json({
          ...pageResponse(page, [{ ...USER, name: page === 2 ? 'Última válida' : 'Inicial' }], page === 1 ? 30 : 20),
        })
      }),
    )
    const { queryClient } = await renderUsersPage()
    await screen.findByText('Inicial')
    const correctionAllowed = createDeferred<undefined>()
    const cancelQueries = queryClient.cancelQueries.bind(queryClient)
    vi.spyOn(queryClient, 'cancelQueries')
      .mockImplementationOnce(cancelQueries)
      .mockImplementationOnce(async (...args) => {
        await cancelQueries(...args)
        await correctionAllowed.promise
      })
    const user = userEvent.setup()

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Ir a la página 3' })) })

    expect(await screen.findByText('Cargando última página disponible')).toBeTruthy()
    expect(screen.queryByText('No hay usuarios registrados')).toBeNull()
    // La cancelación real ya terminó; liberar su continuación dentro de act.
    await act(async () => {
      correctionAllowed.resolve(undefined)
      await correctionAllowed.promise
    })
    expect(await screen.findByText('Última válida')).toBeTruthy()
    expect(requestedPages).toEqual([1, 3, 2])
  })

  it('fails closed without looping when corrected metadata repeats the stale page', async () => {
    const requestedPages: number[] = []
    server.use(
      http.get(USERS_URL, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        requestedPages.push(page)
        if (page === 1) return HttpResponse.json(pageResponse(1, [USER], 30))
        return HttpResponse.json(pageResponse(3, [], 20))
      }),
    )
    const { queryClient } = await renderUsersPage()
    await screen.findByText('Ana')
    const correctionAllowed = createDeferred<undefined>()
    const cancelQueries = queryClient.cancelQueries.bind(queryClient)
    vi.spyOn(queryClient, 'cancelQueries')
      .mockImplementationOnce(cancelQueries)
      .mockImplementationOnce(async (...args) => {
        await cancelQueries(...args)
        await correctionAllowed.promise
      })
    const user = userEvent.setup()

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Ir a la página 3' })) })

    await screen.findByText('Cargando última página disponible')
    await act(async () => {
      correctionAllowed.resolve(undefined)
      await correctionAllowed.promise
    })
    expect(await screen.findByText('No pudimos cargar el directorio')).toBeTruthy()
    expect(requestedPages).toEqual([1, 3, 2])
    expect(screen.queryByText('No hay usuarios registrados')).toBeNull()
  })

  it('replaces the list with one exact search row and removes pagination', async () => {
    server.use(
      http.get(USERS_URL, () => HttpResponse.json(pageResponse(1))),
      http.post(SEARCH_URL, () => HttpResponse.json({ ...USER, email: 'bea@example.com' })),
    )
    await renderUsersPage()
    await screen.findByRole('table', { name: 'Directorio de usuarios' })
    const user = userEvent.setup()
    await act(async () => { await user.type(screen.getByRole('textbox', { name: /correo electrónico/iu }), 'bea@example.com') })

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })

    expect(await screen.findAllByText('bea@example.com')).toHaveLength(2)
    expect(screen.queryByText('ana@example.com')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Paginación de usuarios' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
  })

  it('keeps search 404 local, distinct and without an empty-state create action', async () => {
    server.use(
      http.get(USERS_URL, () => HttpResponse.json(pageResponse(1))),
      http.post(SEARCH_URL, () =>
        HttpResponse.json({ detail: 'Mensaje backend privado' }, { status: 404 }),
      ),
    )
    await renderUsersPage()
    await screen.findByRole('table')
    const user = userEvent.setup()
    await act(async () => { await user.type(screen.getByRole('textbox', { name: /correo electrónico/iu }), 'missing@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })

    expect(await screen.findByText('No existe una cuenta para ese correo.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Paginación de usuarios' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Crear usuario' })).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Mensaje backend privado')
  })

  it.each([
    ['network', undefined],
    ['service', 503],
  ] as const)('keeps %s failure local and retries manually once', async (_case, status) => {
    let requests = 0
    server.use(
      http.get(USERS_URL, () => {
        requests += 1
        if (requests === 1) {
          return status === undefined
            ? HttpResponse.error()
            : HttpResponse.json({ detail: 'private' }, { status })
        }
        return HttpResponse.json(pageResponse(1))
      }),
    )
    const { router } = await renderUsersPage()

    expect(await screen.findByText('Directorio no disponible')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
    const user = userEvent.setup()
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Reintentar' })) })

    expect(await screen.findByRole('table', { name: 'Directorio de usuarios' })).toBeTruthy()
    expect(requests).toBe(2)
    expect(router.state.location.pathname).toBe('/')
  })

  it('preserves exact search context through 503 and retries only that search', async () => {
    let searchRequests = 0
    server.use(
      http.get(USERS_URL, () => HttpResponse.json(pageResponse(1))),
      http.post(SEARCH_URL, () => {
        searchRequests += 1
        return searchRequests === 1
          ? HttpResponse.json({ detail: 'private' }, { status: 503 })
          : HttpResponse.json({ ...USER, email: 'bea@example.com' })
      }),
    )
    await renderUsersPage()
    await screen.findByRole('table')
    const user = userEvent.setup()
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico/iu,
    })
    await act(async () => { await user.type(input, 'bea@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })

    expect(await screen.findByText('Directorio no disponible')).toBeTruthy()
    expect(input.value).toBe('bea@example.com')
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Reintentar' })) })

    expect(await screen.findAllByText('bea@example.com')).toHaveLength(2)
    expect(searchRequests).toBe(2)
    expect(screen.queryByRole('navigation', { name: 'Paginación de usuarios' })).toBeNull()
  })

  it('presents controlled forbidden without retry or global navigation', async () => {
    let requests = 0
    server.use(
      http.get(USERS_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'No autorizado' }, { status: 403 })
      }),
    )
    const { router } = await renderUsersPage()

    expect(await screen.findByText('Acceso denegado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(requests).toBe(1)
    expect(router.state.location.pathname).toBe('/')
  })

  it('reports one sanitized 401 session outcome without retrying', async () => {
    let requests = 0
    server.use(
      http.get(USERS_URL, () => {
        requests += 1
        return HttpResponse.json({ detail: 'private' }, { status: 401 })
      }),
    )
    const onSessionOutcome = vi.fn<(state: SessionFailureState) => void>()
    await renderUsersPage({ onSessionOutcome })

    expect(await screen.findByText('Sesión no disponible')).toBeTruthy()
    await waitFor(() => {
      expect(onSessionOutcome).toHaveBeenCalledWith('dead')
    })
    expect(onSessionOutcome).toHaveBeenCalledTimes(1)
    expect(requests).toBe(1)
  })

  it('fails closed on an invalid contract with generic safe retry', async () => {
    server.use(
      http.get(USERS_URL, () => HttpResponse.json({ ...pageResponse(1), private: 'secret' })),
    )
    await renderUsersPage()

    expect(await screen.findByText('No pudimos cargar el directorio')).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })

  it('has no axe violations in a loaded directory composition', async () => {
    server.use(http.get(USERS_URL, () => HttpResponse.json(pageResponse(1))))
    const { container } = await renderUsersPage()
    await screen.findByRole('table', { name: 'Directorio de usuarios' })

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
