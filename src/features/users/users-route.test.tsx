import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HttpResponse, http } from 'msw'
import { screen, waitFor, within } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

function createUsersApiSpy(): UsersApi & { list: ReturnType<typeof vi.fn<UsersApi['list']>> } {
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
            rol: 'master',
            is_active: true,
          },
        ],
      },
    }),
  )
  return {
    list,
    search: () => Promise.resolve({ kind: 'not-found' }),
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
    for (const path of ['/users', '/users/new', '/forbidden'] as const) {
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

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.all(queryClients.map((queryClient) => queryClient.cancelQueries()))
  })
  for (const history of histories.splice(0)) history.destroy()
  for (const queryClient of queryClients.splice(0)) queryClient.clear()
  vi.restoreAllMocks()
})

describe('production users route', () => {
  it('preloads the users lazy component before the first router load', () => {
    expect(usersRoutePreloaded).toBe(true)
    expect(preloadedPaths).toEqual(['/users', '/users/new', '/forbidden'])
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
            rol: 'master',
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

  it('keeps nested user routes on placeholders without mounting the directory query', async () => {
    const { usersApi } = await renderRoute('/users/new')

    expect(await screen.findByLabelText('Creación de usuario pendiente')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Gestión de usuarios' })).toBeNull()
    expect(usersApi.list).not.toHaveBeenCalled()
  })

  it.each(['master', 'visualizer'] as const)(
    'keeps direct /users forbidden for %s without requesting users',
    async (role) => {
      const { router, usersApi } = await renderRoute('/users', role)

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/forbidden')
      })
      expect(usersApi.list).not.toHaveBeenCalled()
    },
  )
})
