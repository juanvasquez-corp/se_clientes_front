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
import { screen, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import type { UserActionPolicy, UserActionPorts } from './user-actions'
import { UserCardList } from './user-card-list'
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
const INACTIVE_USER: UserResponse = {
  uuid: THIRD_UUID,
  name: 'Carlos',
  last_name: 'Rojas',
  email: 'carlos@example.com',
  phone_number: null,
  role: 'visualizer',
  is_active: false,
}
const USERS = [CURRENT_USER, OTHER_USER, INACTIVE_USER] as const
const roots: Root[] = []
const histories: ReturnType<typeof createMemoryHistory>[] = []

function createActions(): UserActionPorts {
  return { onChangeStatus: vi.fn(), onDelete: vi.fn() }
}

async function renderRepresentations({
  users = USERS,
  currentUserUuid = CURRENT_UUID,
  actions = createActions(),
  actionPolicy,
  includeTable = false,
}: {
  users?: readonly UserResponse[]
  currentUserUuid?: string
  actions?: UserActionPorts
  actionPolicy?: UserActionPolicy
  includeTable?: boolean
} = {}) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <main>
        <UserCardList
          users={users}
          currentUserUuid={currentUserUuid}
          actionPolicy={actionPolicy ?? { kind: 'available', ports: actions }}
        />
        {includeTable ? (
          <UserTable
            users={users}
            currentUserUuid={currentUserUuid}
            actionPolicy={actionPolicy ?? { kind: 'available', ports: actions }}
          />
        ) : null}
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
    routeTree: rootRoute.addChildren([indexRoute, detailRoute, editRoute]),
    history,
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    await router.load()
    root.render(<RouterProvider router={router} />)
  })
  return { actions, container }
}

function cardForEmail(email: string): HTMLElement {
  const list = screen.getByRole('list', { name: 'Usuarios' })
  const article = within(list).getByText(email).closest('article')
  if (!(article instanceof HTMLElement)) throw new Error('Expected a user card.')
  return article
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.resolve()
  })
  for (const history of histories.splice(0)) history.destroy()
  vi.restoreAllMocks()
})

describe('UserCardList', () => {
  it('renders a semantic list of cards with the RF-10 priority information', async () => {
    const { container } = await renderRepresentations()
    const list = screen.getByRole('list', { name: 'Usuarios' })

    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(cardForEmail('ana@example.com')).getByRole('heading', { name: 'Ana' }))
      .toBeTruthy()
    expect(within(cardForEmail('bea@example.com')).getByRole('heading', { name: 'Bea Torres' }))
      .toBeTruthy()
    expect(screen.getByText('Superadministrador').dataset.variant).toBe('role-superadmin')
    expect(screen.getByText('Master').dataset.variant).toBe('role-master')
    expect(screen.getByText('Visualizador').dataset.variant).toBe('role-visualizer')
    expect(screen.getAllByText('Activo')).toHaveLength(2)
    expect(screen.getByText('Inactivo').dataset.variant).toBe('status-inactive')
    expect(container.textContent).not.toContain('+57')
    expect(container.textContent).not.toMatch(/cédula|contraseña|password|hash|fecha/iu)
  })

  it('keeps typed detail/edit navigation and public context for duplicate-safe actions', async () => {
    await renderRepresentations()
    const card = within(cardForEmail('bea@example.com'))

    expect(
      card
        .getByRole('link', { name: 'Ver detalle de Bea Torres (bea@example.com)' })
        .getAttribute('href'),
    ).toBe(`/users/${OTHER_UUID}`)
    expect(
      card
        .getByRole('link', { name: 'Editar a Bea Torres (bea@example.com)' })
        .getAttribute('href'),
    ).toBe(`/users/${OTHER_UUID}/edit`)
  })

  it('uses the same self/other action policy and callback payloads as the table', async () => {
    const actions = createActions()
    await renderRepresentations({ actions })
    const ownCard = within(cardForEmail('ana@example.com'))
    const otherCard = within(cardForEmail('bea@example.com'))
    const inactiveCard = within(cardForEmail('carlos@example.com'))
    const user = userEvent.setup()

    expect(ownCard.queryByRole('button')).toBeNull()
    expect(ownCard.getByRole('link', { name: /ver detalle/iu })).toBeTruthy()
    await user.click(otherCard.getByRole('button', { name: 'Desactivar a Bea Torres (bea@example.com)' }))
    await user.click(otherCard.getByRole('button', { name: 'Eliminar a Bea Torres (bea@example.com)' }))
    await user.click(inactiveCard.getByRole('button', { name: 'Activar a Carlos Rojas (carlos@example.com)' }))

    expect(actions.onChangeStatus).toHaveBeenNthCalledWith(1, OTHER_USER)
    expect(actions.onDelete).toHaveBeenCalledWith(OTHER_USER)
    expect(actions.onChangeStatus).toHaveBeenNthCalledWith(2, INACTIVE_USER)
  })

  it('keeps table/card action parity through the shared action implementation', async () => {
    const { container } = await renderRepresentations({ includeTable: true })
    const card = cardForEmail('bea@example.com')
    const table = screen.getByRole('table', { name: 'Directorio de usuarios' })
    const row = within(table).getByText('bea@example.com').closest('tr')
    if (!(row instanceof HTMLTableRowElement)) throw new Error('Expected a table row.')
    const cardNames = within(card).getAllByRole('link').map((link) => link.getAttribute('aria-label'))
    const rowNames = within(row).getAllByRole('link').map((link) => link.getAttribute('aria-label'))

    expect(cardNames).toEqual(rowNames)
    expect(within(card).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(within(row).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
    expect(container.querySelectorAll('[aria-label="Acciones para Bea Torres (bea@example.com)"]'))
      .toHaveLength(2)
  })

  it('keeps navigation but omits deferred status/delete controls from every card', async () => {
    await renderRepresentations({ actionPolicy: { kind: 'deferred' } })
    const otherCard = within(cardForEmail('bea@example.com'))

    expect(otherCard.getAllByRole('link')).toHaveLength(2)
    expect(otherCard.queryByRole('button')).toBeNull()
    expect(otherCard.queryByText(/activar|desactivar|eliminar/iu)).toBeNull()
  })

  it('renders malicious long public text literally without horizontal overflow classes', async () => {
    const maliciousName = '<script>alert(1)</script>'.repeat(6)
    const user = {
      ...OTHER_USER,
      name: maliciousName,
      email: 'correo'.repeat(20) + '@example.com',
      document_number: 'private-value',
      created_at: 'private-date',
    }
    const { container } = await renderRepresentations({ users: [user] })

    expect(screen.getByRole('heading', { name: `${maliciousName} Torres` })).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).not.toMatch(/private-value|private-date/)
    expect(container.querySelector('[data-user-card-list]')?.className).toContain('min-w-0')
    expect(screen.getByText(user.email).className).toContain('[overflow-wrap:anywhere]')
  })

  it('fails closed for an invalid UUID without exposing an unsafe card link', async () => {
    const { container } = await renderRepresentations({
      users: [{ ...OTHER_USER, uuid: 'internal-id' }],
    })

    expect(screen.getByRole('list', { name: 'Usuarios' }).children).toHaveLength(0)
    expect(container.querySelector('a')).toBeNull()
  })

  it('has logical keyboard order, 44px targets and no axe violations', async () => {
    const { container } = await renderRepresentations()
    const user = userEvent.setup()
    const firstCard = cardForEmail('ana@example.com')

    await user.tab()
    expect(document.activeElement).toBe(
      within(firstCard).getByRole('link', { name: /ver detalle/iu }),
    )
    for (const control of container.querySelectorAll('a, button')) {
      expect(control.className).toMatch(/min-h-11|size-11/)
    }
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
