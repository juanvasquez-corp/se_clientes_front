import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import type { UserResponse } from '../../contracts/schemas/user'
import { ApiError, classifyApiFailure } from '../../core/http/errors'
import { UsersPage } from '../../features/users/users-page'
import type { UsersApi } from '../../features/users/users-api'
import '../../styles/app.css'

const ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const USERS: readonly UserResponse[] = [
  {
    uuid: ACCOUNT_UUID,
    name: 'Ana María',
    last_name: null,
    email: 'ana@example.com',
    phone_number: null,
    rol: 'superadmin',
    is_active: true,
  },
  {
    uuid: 'f55e8c53-f579-4134-980b-84c95acb18ce',
    name: 'Beatriz',
    last_name: 'Torres',
    email: 'beatriz.torres@example.com',
    phone_number: null,
    rol: 'master',
    is_active: true,
  },
]

type FixtureState = 'success' | 'empty' | 'loading' | 'unavailable'

function fixtureState(): FixtureState {
  const state = new URLSearchParams(window.location.search).get('state')
  return state === 'empty' || state === 'loading' || state === 'unavailable'
    ? state
    : 'success'
}

function createFixtureApi(state: FixtureState): UsersApi {
  return {
    list: async () => {
      if (state === 'loading') return await new Promise(() => undefined)
      if (state === 'unavailable') {
        throw new ApiError(classifyApiFailure(503, { detail: 'fixture' }))
      }
      return {
        kind: 'success',
        data: {
          total_records: state === 'empty' ? 0 : USERS.length,
          current_page: 1,
          total_pages: 1,
          page_size: 10,
          data: state === 'empty' ? [] : [...USERS],
        },
      }
    },
    search: (email) => {
      const user = USERS.find((candidate) => candidate.email === email)
      return Promise.resolve(
        user === undefined ? { kind: 'not-found' as const } : { kind: 'success' as const, data: user },
      )
    },
    getUser: () => Promise.resolve({ kind: 'not-found' }),
  }
}

export function UsersPageFixture() {
  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      <UsersPage
        accountUuid={ACCOUNT_UUID}
        currentUserUuid={ACCOUNT_UUID}
        usersApi={createFixtureApi(fixtureState())}
        actionPolicy={{ kind: 'deferred' }}
      />
    </main>
  )
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const rootRoute = createRootRoute({ component: Outlet })
const fixtureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tests/fixtures/users-page.html',
  component: UsersPageFixture,
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
const router = createRouter({
  routeTree: rootRoute.addChildren([fixtureRoute, createRouteNode, detailRoute, editRoute]),
  history: createBrowserHistory(),
})
const rootElement = document.getElementById('fixture-root')

if (!rootElement) throw new Error('No se encontró el elemento raíz del fixture de usuarios.')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
