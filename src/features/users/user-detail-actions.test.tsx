import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act } from 'react'
import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import {
  UserDetailActions,
  type UserDetailActionsProps,
} from './user-detail-actions'

const CURRENT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const OTHER_UUID = 'f55e8c53-f579-4134-980b-84c95acb18ce'

const SELF_USER: UserResponse = {
  uuid: CURRENT_UUID,
  name: 'Ana',
  last_name: 'Gómez',
  email: 'ana.gomez@example.com',
  phone_number: '+57 300 111 2233',
  role: 'superadmin',
  is_active: true,
}

const OTHER_ACTIVE_USER: UserResponse = {
  uuid: OTHER_UUID,
  name: 'Carlos',
  last_name: 'Ramírez',
  email: 'carlos.ramirez@example.com',
  phone_number: '+57 310 555 0199',
  role: 'master',
  is_active: true,
}

const OTHER_INACTIVE_USER: UserResponse = {
  ...OTHER_ACTIVE_USER,
  is_active: false,
}

const roots: Root[] = []
const histories: ReturnType<typeof createMemoryHistory>[] = []

async function renderDetailActions(props: UserDetailActionsProps) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const rootRoute = createRootRoute({ component: Outlet })
  const usersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'users',
    component: Outlet,
  })
  const detailRoute = createRoute({
    getParentRoute: () => usersRoute,
    path: '$userUuid',
    component: () => (
      <main>
        <UserDetailActions {...props} />
      </main>
    ),
  })
  const editRoute = createRoute({
    getParentRoute: () => detailRoute,
    path: 'edit',
    component: () => <h1>Editar usuario</h1>,
  })
  const routeTree = rootRoute.addChildren([
    usersRoute.addChildren([detailRoute.addChildren([editRoute])]),
  ])
  const history = createMemoryHistory({
    initialEntries: [`/users/${props.user.uuid}`],
  })
  histories.push(history)
  const router = createRouter({
    routeTree,
    history,
  })

  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  await act(async () => {
    await router.load()
    root.render(<RouterProvider router={router} />)
  })

  return { container, router }
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.resolve()
  })
  for (const history of histories.splice(0)) history.destroy()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('UserDetailActions', () => {
  it('offers Editar usuario towards /users/$userUuid/edit and invokes status/delete ports for another active user (RF-4, RF-5)', async () => {
    const onToggleStatus = vi.fn()
    const onDeleteUser = vi.fn()
    const { router } = await renderDetailActions({
      currentUserUuid: CURRENT_UUID,
      user: OTHER_ACTIVE_USER,
      onToggleStatus,
      onDeleteUser,
    })

    const editLink = screen.getByRole('link', { name: 'Editar usuario' })
    const deactivateButton = screen.getByRole('button', { name: 'Desactivar usuario' })
    const deleteButton = screen.getByRole('button', { name: 'Eliminar usuario' })

    expect(editLink.getAttribute('href')).toBe(`/users/${OTHER_UUID}/edit`)
    expect(editLink.className).toContain('min-h-11')
    expect(editLink.className).toContain('min-w-11')
    expect(deactivateButton.className).toContain('min-h-11')
    expect(deleteButton.className).toContain('bg-status-danger')
    expect(screen.queryByText(/no pueden modificarse desde tu propia cuenta/iu)).toBeNull()

    const user = userEvent.setup()
    await user.click(deactivateButton)
    await user.click(deleteButton)

    expect(onToggleStatus).toHaveBeenCalledTimes(1)
    expect(onToggleStatus).toHaveBeenCalledWith(OTHER_ACTIVE_USER)
    expect(onDeleteUser).toHaveBeenCalledTimes(1)
    expect(onDeleteUser).toHaveBeenCalledWith(OTHER_ACTIVE_USER)

    await act(async () => {
      await user.click(editLink)
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/users/${OTHER_UUID}/edit`)
    })
  })

  it('offers Activar usuario when the target account is inactive (RF-5)', async () => {
    const onToggleStatus = vi.fn()
    await renderDetailActions({
      currentUserUuid: CURRENT_UUID,
      user: OTHER_INACTIVE_USER,
      onToggleStatus,
    })

    const activateButton = screen.getByRole('button', { name: 'Activar usuario' })
    expect(screen.queryByRole('button', { name: 'Desactivar usuario' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar usuario' })).toBeNull()

    const user = userEvent.setup()
    await user.click(activateButton)
    expect(onToggleStatus).toHaveBeenCalledWith(OTHER_INACTIVE_USER)
  })

  it('does not render inert status or delete buttons when Spec 012 ports are deferred', async () => {
    await renderDetailActions({
      currentUserUuid: CURRENT_UUID,
      user: OTHER_ACTIVE_USER,
      actionPolicy: { kind: 'deferred' },
    })

    expect(screen.getByRole('link', { name: 'Editar usuario' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('hides status and delete actions for the own account even if ports are passed, while keeping Editar usuario and showing the self restriction notice (RF-4, RF-6)', async () => {
    const onToggleStatus = vi.fn()
    const onDeleteUser = vi.fn()
    const { container } = await renderDetailActions({
      currentUserUuid: CURRENT_UUID.toUpperCase(),
      user: SELF_USER,
      onToggleStatus,
      onDeleteUser,
    })

    const editLink = screen.getByRole('link', { name: 'Editar usuario' })
    expect(editLink.getAttribute('href')).toBe(`/users/${CURRENT_UUID}/edit`)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/activar usuario|desactivar usuario|eliminar usuario/iu)).toBeNull()
    expect(
      screen.getByText(
        'Tu rol y tu estado no pueden modificarse desde tu propia cuenta, ni puedes eliminarla.',
      ),
    ).toBeTruthy()
    expect(container.textContent).not.toContain(CURRENT_UUID)
  })

  it('fails closed without rendering links or buttons if target UUID is invalid', async () => {
    const { container } = await renderDetailActions({
      currentUserUuid: CURRENT_UUID,
      user: { ...OTHER_ACTIVE_USER, uuid: 'not-a-uuid' },
      onToggleStatus: vi.fn(),
      onDeleteUser: vi.fn(),
    })

    expect(container.querySelector('a, button')).toBeNull()
  })

  it.each([
    ['other account with actions', CURRENT_UUID, OTHER_ACTIVE_USER],
    ['own account with restriction notice', CURRENT_UUID, SELF_USER],
  ] as const)('has 0 axe accessibility violations for %s', async (_label, currentUserUuid, user) => {
    const { container } = await renderDetailActions({
      currentUserUuid,
      user,
      onToggleStatus: vi.fn(),
      onDeleteUser: vi.fn(),
    })

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
