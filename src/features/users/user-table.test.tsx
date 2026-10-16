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
import { screen, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import type { UserActionPorts } from './user-actions'
import { UserTable } from './user-table'

const CURRENT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const THIRD_UUID = 'f1533379-cfe1-4fb0-936a-1f2a95e52f9b'
const CURRENT_USER: UserResponse = {
  uuid: CURRENT_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: '+57 300 111 1111',
  role: 'superadmin',
  is_active: true,
}
const OTHER_USER: UserResponse = {
  uuid: OTHER_UUID,
  name: 'Bea',
  last_name: 'Torres',
  email: 'bea@example.com',
  phone_number: null,
  role: 'master',
  is_active: true,
}
const DUPLICATE_USER: UserResponse = {
  uuid: THIRD_UUID,
  name: 'Bea',
  last_name: 'Torres',
  email: 'bea.duplicate@example.com',
  phone_number: '+57 300 333 3333',
  role: 'visualizer',
  is_active: false,
}
const USERS: readonly UserResponse[] = [CURRENT_USER, OTHER_USER, DUPLICATE_USER]

const roots: Root[] = []
const histories: ReturnType<typeof createMemoryHistory>[] = []

function createActionPorts(): UserActionPorts {
  return {
    onChangeStatus: vi.fn(),
    onDelete: vi.fn(),
  }
}

async function renderTable({
  users = USERS,
  currentUserUuid = CURRENT_UUID,
  actions = createActionPorts(),
}: {
  users?: readonly UserResponse[]
  currentUserUuid?: string
  actions?: UserActionPorts
} = {}) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const rootRoute = createRootRoute({ component: Outlet })
  const tableRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <main>
        <UserTable
          users={users}
          currentUserUuid={currentUserUuid}
          actionPolicy={{ kind: 'available', ports: actions }}
        />
      </main>
    ),
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
    routeTree: rootRoute.addChildren([tableRoute, detailRoute, editRoute]),
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
        <RouterProvider router={router} />
      </StrictMode>,
    )
  })

  return { actions, container, router }
}

function rowForEmail(email: string): HTMLTableRowElement {
  const row = screen.getByText(email).closest('tr')
  if (!(row instanceof HTMLTableRowElement)) throw new Error('Expected a user table row.')
  return row
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.resolve()
  })
  for (const history of histories.splice(0)) history.destroy()
  vi.restoreAllMocks()
})

describe('UserTable', () => {
  it('renders the exact public directory columns and nullable last name', async () => {
    const { container } = await renderTable()
    const table = screen.getByRole('table', { name: 'Directorio de usuarios' })

    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Nombre',
      'Apellido',
      'Correo',
      'Rol',
      'Estado',
      'Acciones',
    ])
    expect(within(rowForEmail('ana@example.com')).getByText('No informado')).toBeTruthy()
    expect(container.textContent).not.toContain('+57')
    expect(container.textContent).not.toMatch(/teléfono|cédula|contraseña|password|hash|fecha/iu)
    expect(container.textContent).not.toContain(CURRENT_UUID)
  })

  it('presents every role and both statuses with semantic badges', async () => {
    await renderTable()

    expect(screen.getByText('Superadministrador').dataset.variant).toBe('role-superadmin')
    expect(screen.getByText('Master').dataset.variant).toBe('role-master')
    expect(screen.getByText('Visualizador').dataset.variant).toBe('role-visualizer')
    expect(screen.getAllByText('Activo')).toHaveLength(2)
    expect(screen.getByText('Inactivo').dataset.variant).toBe('status-inactive')
  })

  it('keeps detail/edit links but removes status and delete actions from the own row', async () => {
    await renderTable()
    const ownRow = within(rowForEmail('ana@example.com'))

    expect(ownRow.getByRole('link', { name: /ver detalle de ana/iu })).toBeTruthy()
    expect(ownRow.getByRole('link', { name: /editar a ana/iu })).toBeTruthy()
    expect(ownRow.queryByRole('button')).toBeNull()
    expect(ownRow.queryByText(/activar|desactivar|eliminar/iu)).toBeNull()
  })

  it('exposes applicable action ports for another user without executing an API', async () => {
    const actions = createActionPorts()
    await renderTable({ actions })
    const user = userEvent.setup()
    const activeRow = within(rowForEmail('bea@example.com'))
    const inactiveRow = within(rowForEmail('bea.duplicate@example.com'))

    await user.click(activeRow.getByRole('button', { name: 'Desactivar a Bea Torres (bea@example.com)' }))
    await user.click(activeRow.getByRole('button', { name: 'Eliminar a Bea Torres (bea@example.com)' }))
    await user.click(
      inactiveRow.getByRole('button', {
        name: 'Activar a Bea Torres (bea.duplicate@example.com)',
      }),
    )

    expect(actions.onChangeStatus).toHaveBeenNthCalledWith(1, OTHER_USER)
    expect(actions.onDelete).toHaveBeenCalledWith(OTHER_USER)
    expect(actions.onChangeStatus).toHaveBeenNthCalledWith(2, DUPLICATE_USER)
  })

  it('builds typed detail/edit hrefs and distinguishes duplicate names by public email', async () => {
    await renderTable()
    const firstDuplicate = within(rowForEmail('bea@example.com'))
    const secondDuplicate = within(rowForEmail('bea.duplicate@example.com'))

    expect(
      firstDuplicate
        .getByRole('link', { name: 'Ver detalle de Bea Torres (bea@example.com)' })
        .getAttribute('href'),
    ).toBe(`/users/${OTHER_UUID}`)
    expect(
      firstDuplicate
        .getByRole('link', { name: 'Editar a Bea Torres (bea@example.com)' })
        .getAttribute('href'),
    ).toBe(`/users/${OTHER_UUID}/edit`)
    expect(
      secondDuplicate
        .getByRole('link', {
          name: 'Ver detalle de Bea Torres (bea.duplicate@example.com)',
        })
        .getAttribute('href'),
    ).toBe(`/users/${THIRD_UUID}`)
  })

  it('renders long malicious values only as wrapping text', async () => {
    const maliciousName = '<script>alert(1)</script>'.repeat(8)
    const privateUser = {
      ...OTHER_USER,
      name: maliciousName,
      last_name: '<img src=x onerror=alert(2)>',
      document_number: 'private-value',
      password_hash: 'private-hash',
      created_at: 'private-date',
    }
    const { container } = await renderTable({ users: [privateUser] })

    expect(screen.getByText(maliciousName)).toBeTruthy()
    expect(screen.getByText('<img src=x onerror=alert(2)>')).toBeTruthy()
    expect(container.querySelector('script, img')).toBeNull()
    expect(container.textContent).not.toMatch(/private-value|private-hash|private-date/)
  })

  it('omits a row with an invalid route UUID instead of creating an unsafe href', async () => {
    const invalidUser = { ...OTHER_USER, uuid: 'internal-id' }
    const { container } = await renderTable({ users: [invalidUser] })

    expect(container.querySelector('tbody')?.children).toHaveLength(0)
    expect(container.querySelector('a')).toBeNull()
  })

  it('has keyboard-sized controls and no automated accessibility violations', async () => {
    const { container } = await renderTable()
    const table = screen.getByRole('table', { name: 'Directorio de usuarios' })
    const user = userEvent.setup()

    expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(6)
    for (const control of table.querySelectorAll('a, button')) {
      expect(control.className).toMatch(/min-h-11|size-11/)
    }
    await user.tab()
    expect(document.activeElement).toBe(
      within(rowForEmail('ana@example.com')).getByRole('link', { name: /ver detalle/iu }),
    )
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
