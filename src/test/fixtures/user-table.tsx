import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { UserResponse } from '../../contracts/schemas/user'
import type { DirectoryState } from '../../features/users/directory-mode'
import { Pagination } from '../../features/users/pagination'
import { UserSearch } from '../../features/users/user-search'
import { UserTable } from '../../features/users/user-table'
import '../../styles/app.css'

const CURRENT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const USERS: readonly UserResponse[] = [
  {
    uuid: CURRENT_UUID,
    name: 'Ana María',
    last_name: null,
    email: 'ana@example.com',
    phone_number: null,
    role: 'superadmin',
    is_active: true,
  },
  {
    uuid: 'f55e8c53-f579-4134-980b-84c95acb18ce',
    name: 'Beatriz',
    last_name: 'Torres',
    email: 'beatriz.torres@example.com',
    phone_number: null,
    role: 'master',
    is_active: true,
  },
  {
    uuid: 'f1533379-cfe1-4fb0-936a-1f2a95e52f9b',
    name: 'Carlos con un nombre suficientemente extenso',
    last_name: 'Rodríguez',
    email: 'carlos.rodriguez.con.correo.extenso@example.com',
    phone_number: null,
    role: 'visualizer',
    is_active: false,
  },
]

export function UserTableFixture() {
  const [page, setPage] = useState(2)
  const startsInSearch = new URLSearchParams(window.location.search).get('mode') === 'search'
  const [mode, setMode] = useState<DirectoryState>(
    startsInSearch
      ? {
          kind: 'search',
          email: 'beatriz.torres@example.com',
          preservedPage: 2,
          size: 10,
        }
      : { kind: 'list', page: 2, size: 10 },
  )
  const visibleUsers = mode.kind === 'search' ? USERS.slice(1, 2) : USERS

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-bold text-brand-heading">Directorio de usuarios</h1>
        <p className="mt-2 text-text-secondary">
          Verificación visual de datos públicos y acciones permitidas.
        </p>
      </header>
      <UserSearch
        mode={mode}
        feedback="idle"
        interactionState="idle"
        onSearch={(input) => {
          setMode((current) => ({
            kind: 'search',
            email: input.email,
            preservedPage: current.kind === 'list' ? current.page : current.preservedPage,
            size: current.size,
          }))
        }}
        onClear={() => {
          setMode((current) => ({
            kind: 'list',
            page: current.kind === 'search' ? current.preservedPage : current.page,
            size: current.size,
          }))
        }}
      />
      <UserTable
        users={visibleUsers}
        currentUserUuid={CURRENT_UUID}
        actionPolicy={{
          kind: 'available',
          ports: {
            onChangeStatus: () => undefined,
            onDelete: () => undefined,
          },
        }}
      />
      {mode.kind === 'list' ? (
        <Pagination
          totalRecords={27}
          currentPage={page}
          totalPages={3}
          pageSize={10}
          interactionState="idle"
          onPageChange={setPage}
        />
      ) : null}
    </main>
  )
}

const rootRoute = createRootRoute({ component: Outlet })
const fixtureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tests/fixtures/user-table.html',
  component: UserTableFixture,
})
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users/$userUuid',
  component: () => <p>Detalle de usuario</p>,
})
const editRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users/$userUuid/edit',
  component: () => <p>Edición de usuario</p>,
})
const router = createRouter({
  routeTree: rootRoute.addChildren([fixtureRoute, detailRoute, editRoute]),
  history: createBrowserHistory(),
})
const rootElement = document.getElementById('fixture-root')

if (!rootElement) throw new Error('No se encontró el elemento raíz del fixture de tabla.')

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
