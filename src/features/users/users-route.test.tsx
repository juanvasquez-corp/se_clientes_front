import { notifyManager, QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HttpResponse, http } from 'msw'
import { screen, waitFor, within } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserRole } from '../../contracts/schemas/user'
import { createApiClient } from '../../core/http/api-client'
import { createSessionStore } from '../../core/session/session-store'
import { AppProviders } from '../../app/providers'
import { createAppRouter } from '../../app/router/router'
import type { AppRouterContext } from '../../app/router/router-context'
import { createProfileApiStub } from '../../test/profile-api-stub'
import { server } from '../../test/server'
import { createUsersApi, type UsersApi } from './users-api'

const ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const roots: Root[] = []
const queryClients: QueryClient[] = []
const histories: ReturnType<typeof createMemoryHistory>[] = []
let usersRoutePreloaded = false
const preloadedPaths: string[] = []

function createUsersApiSpy(): UsersApi & {
  list: ReturnType<typeof vi.fn<UsersApi['list']>>
  getUser: ReturnType<typeof vi.fn<UsersApi['getUser']>>
} {
  const list = vi.fn<UsersApi['list']>(() =>
    Promise.resolve({
      kind: 'success',
      data: {
        total_records: 1,
        current_page: 1,
        total_pages: 1,
        page_size: 10,
        data: [
          {
            uuid: OTHER_UUID,
            name: 'Bea',
            last_name: 'Torres',
            email: 'bea@example.com',
            phone_number: null,
            role: 'master',
            is_active: true,
          },
        ],
      },
    }),
  )
  const getUser = vi.fn<UsersApi['getUser']>((params) => {
    const targetUuid = typeof params === 'string' ? params : String(params.userUuid)
    if (targetUuid.toLowerCase() === ACCOUNT_UUID) {
      return Promise.resolve({
        kind: 'success',
        data: {
          uuid: ACCOUNT_UUID,
          name: 'Ana',
          last_name: 'Gómez',
          email: 'ana@example.com',
          phone_number: null,
          role: 'superadmin',
          is_active: true,
        },
      })
    }
    return Promise.resolve({
      kind: 'success',
      data: {
        uuid: OTHER_UUID,
        name: 'Bea',
        last_name: 'Torres',
        email: 'bea@example.com',
        phone_number: '+57 310 555 0199',
        role: 'master',
        is_active: true,
      },
    })
  })
  return {
    list,
    search: () => Promise.resolve({ kind: 'not-found' }),
    getUser,
  }
}

function authenticate(role: UserRole) {
  const store = createSessionStore()
  store.getState().stageTokens({
    accessToken: 'route-access',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'route-csrf',
  })
  store.getState().completeSession({
    userUuid: ACCOUNT_UUID,
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role,
    isActive: true,
  })
  return store
}

function createRouteContext({
  queryClient,
  role,
  usersApi,
}: {
  readonly queryClient: QueryClient
  readonly role: UserRole
  readonly usersApi: UsersApi
}): AppRouterContext {
  const store = authenticate(role)
  return {
    queryClient,
    session: {
      store,
      login: () => Promise.resolve({ kind: 'technical' }),
      logoutController: { logout: () => Promise.resolve({ kind: 'logged-out' }) },
      profileApi: createProfileApiStub(),
      usersApi,
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
}

async function preloadUsersRouteComponent(): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const history = createMemoryHistory({ initialEntries: ['/users'] })
  const router = createAppRouter({
    context: createRouteContext({
      queryClient,
      role: 'superadmin',
      usersApi: createUsersApiSpy(),
    }),
    history,
  })

  try {
    for (const path of [
      '/users',
      '/users/new',
      '/users/$userUuid',
      '/users/$userUuid/edit',
      '/login',
      '/forbidden',
    ] as const) {
      const component = router.routesById[path].options.component
      if (component === undefined || typeof component.preload !== 'function') {
        throw new Error(`Expected preloadable ${path} component.`)
      }
      const preload = vi.spyOn(component, 'preload')
      try {
        await component.preload()
        if (path === '/users') usersRoutePreloaded = preload.mock.calls.length === 1
        preloadedPaths.push(path)
      } finally {
        preload.mockRestore()
      }
    }
  } finally {
    history.destroy()
    queryClient.clear()
  }
}

await preloadUsersRouteComponent()

async function renderRoute(
  path: string,
  role: UserRole = 'superadmin',
  providedUsersApi?: UsersApi,
) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const usersApi = providedUsersApi ?? createUsersApiSpy()
  const context = createRouteContext({ queryClient, role, usersApi })
  const history = createMemoryHistory({ initialEntries: [path] })
  histories.push(history)
  queryClients.push(queryClient)
  const router = createAppRouter({
    context,
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
        <AppProviders queryClient={queryClient}>
          <RouterProvider router={router} />
        </AppProviders>
      </StrictMode>,
    )
  })
  return { container, router, usersApi }
}

beforeEach(() => {
  notifyManager.setNotifyFunction((notify) => {
    act(notify)
  })
})

afterEach(async () => {
  try {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount()
      await Promise.all(queryClients.map((queryClient) => queryClient.cancelQueries()))
    })
    for (const history of histories.splice(0)) history.destroy()
    for (const queryClient of queryClients.splice(0)) queryClient.clear()
    vi.restoreAllMocks()
  } finally {
    notifyManager.setNotifyFunction((notify) => {
      notify()
    })
  }
})

describe('production users route', () => {
  it('preloads the users lazy component before the first router load', () => {
    expect(usersRoutePreloaded).toBe(true)
    expect(preloadedPaths).toEqual([
      '/users',
      '/users/new',
      '/users/$userUuid',
      '/users/$userUuid/edit',
      '/login',
      '/forbidden',
    ])
  })

  it('mounts the real directory once at exact /users with deferred destructive actions', async () => {
    const { usersApi } = await renderRoute('/users')

    expect(await screen.findByRole('heading', { level: 1, name: 'Gestión de usuarios' }))
      .toBeTruthy()
    await waitFor(() => {
      expect(usersApi.list).toHaveBeenCalledTimes(1)
    })
    expect(usersApi.list).toHaveBeenCalledWith(
      { page: 1, size: 10 },
      expect.any(AbortSignal),
    )
    const table = await screen.findByRole('table', { name: 'Directorio de usuarios' })
    const row = within(table).getByText('bea@example.com').closest('tr')
    if (!(row instanceof HTMLTableRowElement)) throw new Error('Expected directory row.')
    expect(within(row).getAllByRole('link')).toHaveLength(2)
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('shares one effective delayed MSW list read across the StrictMode mount cycle', async () => {
    const apiBaseUrl = 'https://api.example.test/api'
    let markStarted: (() => void) | undefined
    let releaseResponse: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const responseAllowed = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    let requests = 0
    let completions = 0
    let aborts = 0
    server.use(
      http.get(`${apiBaseUrl}/users`, async ({ request }) => {
        requests += 1
        request.signal.addEventListener('abort', () => {
          aborts += 1
        }, { once: true })
        markStarted?.()
        await responseAllowed
        if (!request.signal.aborted) completions += 1
        return HttpResponse.json({
          total_records: 1,
          current_page: 1,
          total_pages: 1,
          page_size: 10,
          data: [{
            uuid: OTHER_UUID,
            name: 'Lectura única',
            last_name: null,
            email: 'unique@example.com',
            phone_number: null,
            role: 'master',
            is_active: true,
          }],
        })
      }),
    )
    const usersApi = createUsersApi({
      apiClient: createApiClient({
        apiBaseUrl,
        getAccessToken: () => 'strict-access',
        sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
      }),
    })

    await renderRoute('/users', 'superadmin', usersApi)
    await started
    await act(async () => {
      releaseResponse?.()
      await responseAllowed
      await screen.findAllByText('Lectura única')
    })

    expect(screen.getAllByText('Lectura única')).toHaveLength(2)
    expect(requests).toBe(1)
    expect(completions).toBe(1)
    expect(aborts).toBe(0)
  })

  it('releases the retained list subscription and aborts its request when leaving users', async () => {
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let observedSignal: AbortSignal | undefined
    const usersApi: UsersApi = {
      list: (_params, signal) => {
        observedSignal = signal
        markStarted?.()
        return new Promise(() => undefined)
      },
      search: () => Promise.resolve({ kind: 'not-found' }),
      getUser: () => Promise.resolve({ kind: 'not-found' }),
    }
    await renderRoute('/users', 'superadmin', usersApi)
    await started
    await screen.findByRole('heading', { level: 1, name: 'Gestión de usuarios' })

    const root = roots.pop()
    if (root === undefined) throw new Error('Expected mounted users root.')
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    await Promise.resolve()

    expect(observedSignal?.aborted).toBe(true)
  })

  it('keeps nested user creation and edit routes on placeholders without mounting directory or detail queries', async () => {
    const newRoute = await renderRoute('/users/new')

    expect(await screen.findByLabelText('Creación de usuario pendiente')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Gestión de usuarios' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Detalle de usuario' })).toBeNull()
    expect(newRoute.usersApi.list).not.toHaveBeenCalled()
    expect(newRoute.usersApi.getUser).not.toHaveBeenCalled()

    const editRoute = await renderRoute(`/users/${OTHER_UUID}/edit`)

    expect(await screen.findByLabelText('Edición de usuario pendiente')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Detalle de usuario' })).toBeNull()
    expect(editRoute.usersApi.list).not.toHaveBeenCalled()
    expect(editRoute.usersApi.getUser).not.toHaveBeenCalled()
  })

  it('mounts the real detail page at /users/$userUuid with normalized param, edit link, deferred third-party actions and self restriction notice', async () => {
    const { container, router, usersApi } = await renderRoute(
      `/users/${OTHER_UUID.toUpperCase()}`,
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Detalle de usuario' }),
    ).toBeTruthy()
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Bea Torres' }),
    ).toBeTruthy()
    expect(screen.queryByLabelText('Detalle de usuario pendiente')).toBeNull()
    expect(usersApi.list).not.toHaveBeenCalled()
    expect(usersApi.getUser).toHaveBeenCalledTimes(1)
    expect(usersApi.getUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userUuid: OTHER_UUID,
      }),
    )
    expect(
      within(container).getByRole('link', { name: 'Editar usuario' }).getAttribute('href'),
    ).toBe(`/users/${OTHER_UUID}/edit`)
    expect(
      within(container).queryByRole('button', { name: /activar|desactivar|eliminar/iu }),
    ).toBeNull()

    await act(async () => {
      within(container).getByRole('link', { name: 'Editar usuario' }).click()
      await router.load()
    })
    expect(router.state.location.pathname).toBe(`/users/${OTHER_UUID}/edit`)
    expect(
      await within(container).findByLabelText('Edición de usuario pendiente'),
    ).toBeTruthy()

    const selfRender = await renderRoute(`/users/${ACCOUNT_UUID}`)
    expect(
      await within(selfRender.container).findByRole('heading', {
        level: 2,
        name: 'Ana Gómez',
      }),
    ).toBeTruthy()
    expect(
      within(selfRender.container)
        .getByRole('link', { name: 'Editar usuario' })
        .getAttribute('href'),
    ).toBe(`/users/${ACCOUNT_UUID}/edit`)
    expect(
      within(selfRender.container).getByText(
        'Tu rol y tu estado no pueden modificarse desde tu propia cuenta, ni puedes eliminarla.',
      ),
    ).toBeTruthy()
    expect(
      within(selfRender.container).queryByRole('button', {
        name: /activar|desactivar|eliminar/iu,
      }),
    ).toBeNull()
  })

  it('shares one effective delayed MSW detail read across the StrictMode mount cycle', async () => {
    const apiBaseUrl = 'https://api.example.test/api'
    let markStarted: (() => void) | undefined
    let releaseResponse: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const responseAllowed = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    let requests = 0
    let completions = 0
    let aborts = 0
    server.use(
      http.get(`${apiBaseUrl}/users/${OTHER_UUID}`, async ({ request }) => {
        requests += 1
        request.signal.addEventListener(
          'abort',
          () => {
            aborts += 1
          },
          { once: true },
        )
        markStarted?.()
        await responseAllowed
        if (!request.signal.aborted) completions += 1
        return HttpResponse.json({
          uuid: OTHER_UUID,
          name: 'Detalle único',
          last_name: 'Confirmado',
          email: 'detalle.unico@example.com',
          phone_number: null,
          role: 'master',
          is_active: true,
        })
      }),
    )
    const usersApi = createUsersApi({
      apiClient: createApiClient({
        apiBaseUrl,
        getAccessToken: () => 'strict-detail-access',
        sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
      }),
    })

    await renderRoute(`/users/${OTHER_UUID}`, 'superadmin', usersApi)
    await started
    await act(async () => {
      releaseResponse?.()
      await responseAllowed
      await screen.findByRole('heading', {
        level: 2,
        name: 'Detalle único Confirmado',
      })
    })

    expect(
      screen.getByRole('heading', { level: 2, name: 'Detalle único Confirmado' }),
    ).toBeTruthy()
    expect(requests).toBe(1)
    expect(completions).toBe(1)
    expect(aborts).toBe(0)
  })

  it('releases the retained detail subscription and aborts its request when leaving user detail', async () => {
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let observedSignal: AbortSignal | undefined
    const usersApi: UsersApi = {
      list: () =>
        Promise.resolve({
          kind: 'success',
          data: {
            total_records: 0,
            current_page: 1,
            total_pages: 1,
            page_size: 10,
            data: [],
          },
        }),
      search: () => Promise.resolve({ kind: 'not-found' }),
      getUser: (params, signal) => {
        observedSignal =
          typeof params === 'string' ? signal : (params.signal ?? signal)
        markStarted?.()
        return new Promise(() => undefined)
      },
    }
    await renderRoute(`/users/${OTHER_UUID}`, 'superadmin', usersApi)
    await started
    await screen.findByRole('heading', { level: 1, name: 'Detalle de usuario' })

    const root = roots.pop()
    if (root === undefined) throw new Error('Expected mounted detail root.')
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    await Promise.resolve()

    expect(observedSignal?.aborted).toBe(true)
  })

  it('aborts the previous UUID request and isolates detail cache when navigating between UUIDs or clearing on account change', async () => {
    const signals = new Map<string, AbortSignal | undefined>()
    let markFirstStarted: (() => void) | undefined
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })

    const usersApi: UsersApi = {
      list: () =>
        Promise.resolve({
          kind: 'success',
          data: {
            total_records: 0,
            current_page: 1,
            total_pages: 1,
            page_size: 10,
            data: [],
          },
        }),
      search: () => Promise.resolve({ kind: 'not-found' }),
      getUser: (params, signal) => {
        const targetUuid =
          typeof params === 'string' ? params : String(params.userUuid)
        const activeSignal =
          typeof params === 'string' ? signal : (params.signal ?? signal)
        signals.set(targetUuid, activeSignal)
        if (targetUuid === OTHER_UUID) {
          markFirstStarted?.()
          return new Promise(() => undefined)
        }
        return Promise.resolve({
          kind: 'success',
          data: {
            uuid: ACCOUNT_UUID,
            name: 'Ana',
            last_name: 'Gómez',
            email: 'ana@example.com',
            phone_number: null,
            role: 'superadmin',
            is_active: true,
          },
        })
      },
    }

    const { router } = await renderRoute(
      `/users/${OTHER_UUID}`,
      'superadmin',
      usersApi,
    )
    await firstStarted
    await screen.findByRole('heading', { level: 1, name: 'Detalle de usuario' })

    await act(async () => {
      await router.navigate({
        to: '/users/$userUuid',
        params: { userUuid: ACCOUNT_UUID },
      })
    })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ana Gómez' }),
    ).toBeTruthy()
    expect(signals.get(OTHER_UUID)?.aborted).toBe(true)

    router.options.context.queryClient.clear()
    expect(router.options.context.queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('waits for initial session restoration on /users/$userUuid without flashing detail content or calling getUser early', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    let resolveRestore: ((value: 'authenticated') => void) | undefined
    const restorePromise = new Promise<'authenticated'>((resolve) => {
      resolveRestore = resolve
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const usersApi = createUsersApiSpy()
    const store = createSessionStore()
    const context: AppRouterContext = {
      queryClient,
      session: {
        store,
        login: () => Promise.resolve({ kind: 'technical' }),
        logoutController: { logout: () => Promise.resolve({ kind: 'logged-out' }) },
        profileApi: createProfileApiStub(),
        usersApi,
        createSecurityRecoveryController: () => ({
          operation: 'refresh',
          restoreProtection: () => Promise.resolve({ kind: 'restored' }),
          retryOriginal: () => Promise.resolve({ kind: 'dispatched' }),
        }),
        coordinator: {
          restoreInitial: () => restorePromise,
          retryInitial: () => Promise.resolve('authenticated'),
          cancelInitial: () => undefined,
        },
      },
    }
    const history = createMemoryHistory({
      initialEntries: [`/users/${OTHER_UUID}`],
    })
    histories.push(history)
    queryClients.push(queryClient)
    const router = createAppRouter({ context, history })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(
        <StrictMode>
          <AppProviders queryClient={queryClient}>
            <RouterProvider router={router} />
          </AppProviders>
        </StrictMode>,
      )
      await Promise.resolve()
    })

    expect(screen.queryByRole('heading', { name: 'Detalle de usuario' })).toBeNull()
    expect(usersApi.getUser).not.toHaveBeenCalled()

    await act(async () => {
      store.getState().stageTokens({
        accessToken: 'restored-access',
        tokenType: 'bearer',
        expiresIn: 120,
        csrfToken: 'restored-csrf',
      })
      store.getState().completeSession({
        userUuid: ACCOUNT_UUID,
        name: 'Ana',
        lastName: null,
        email: 'ana@example.com',
        phoneNumber: null,
        role: 'superadmin',
        isActive: true,
      })
      resolveRestore?.('authenticated')
      await router.load()
    })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Bea Torres' }),
    ).toBeTruthy()
    expect(usersApi.getUser).toHaveBeenCalledTimes(1)
  })

  it.each(['master', 'visualizer'] as const)(
    'keeps direct /users and /users/$userUuid forbidden for %s without requesting users or detail',
    async (role) => {
      const directoryAttempt = await renderRoute('/users', role)

      await waitFor(() => {
        expect(directoryAttempt.router.state.location.pathname).toBe('/forbidden')
      })
      expect(directoryAttempt.usersApi.list).not.toHaveBeenCalled()

      const detailAttempt = await renderRoute(`/users/${OTHER_UUID}`, role)

      await waitFor(() => {
        expect(detailAttempt.router.state.location.pathname).toBe('/forbidden')
      })
      expect(detailAttempt.usersApi.getUser).not.toHaveBeenCalled()
      expect(screen.queryByRole('heading', { name: 'Detalle de usuario' })).toBeNull()
    },
  )

  it.each([
    ['dead', '/login'],
    ['blocked', '/forbidden'],
  ] as const)(
    'navigates from /users/$userUuid to %s when getUser reports a %s session outcome',
    async (sessionState, destination) => {
      const usersApi: UsersApi = {
        list: () => Promise.resolve({ kind: 'session', state: sessionState }),
        search: () => Promise.resolve({ kind: 'session', state: sessionState }),
        getUser: () => Promise.resolve({ kind: 'session', state: sessionState }),
      }

      const { router } = await renderRoute(
        `/users/${OTHER_UUID}`,
        'superadmin',
        usersApi,
      )

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(destination)
      })
    },
  )
})
