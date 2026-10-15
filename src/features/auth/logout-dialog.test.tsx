import { StrictMode, act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen, waitFor, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  LogoutController,
  LogoutResult,
} from './logout-controller'
import { LogoutDialog } from './logout-dialog'

const roots: ReturnType<typeof createRoot>[] = []

async function renderDialog(controller: LogoutController) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <LogoutDialog controller={controller} />
      </StrictMode>,
    )
    await Promise.resolve()
  })
  return container
}

function controllerWith(logout: () => Promise<LogoutResult>): LogoutController {
  return { logout }
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  }
})

describe('LogoutDialog', () => {
  it.each(['cancel', 'escape'] as const)(
    'closes through %s without a request and restores trigger focus',
    async (action) => {
      const logout = vi.fn(() => Promise.resolve({ kind: 'logged-out' } as const))
      const user = userEvent.setup()
      await renderDialog(controllerWith(logout))
      const trigger = screen.getByRole('button', { name: 'Cerrar sesión' })

      await act(async () => { await user.click(trigger) })
      const dialog = screen.getByRole('dialog', { name: 'Cerrar sesión' })
      if (action === 'cancel') {
        await act(async () => { await user.click(within(dialog).getByRole('button', { name: 'Cancelar' })) })
      } else {
        await act(async () => { await user.keyboard('{Escape}') })
      }

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(logout).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(trigger)
    },
  )

  it('blocks double confirmation while pending and closes after success', async () => {
    let resolveLogout: ((result: LogoutResult) => void) | undefined
    const logout = vi.fn(
      () =>
        new Promise<LogoutResult>((resolve) => {
          resolveLogout = resolve
        }),
    )
    const user = userEvent.setup()
    await renderDialog(controllerWith(logout))
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Cerrar sesión' })) })
    const dialog = screen.getByRole('dialog')

    await act(async () => {
      await user.dblClick(within(dialog).getByRole('button', { name: 'Cerrar sesión' }))
    })

    expect(logout).toHaveBeenCalledOnce()
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Cerrando sesión...',
      }).disabled,
    ).toBe(true)
    await act(async () => { await user.keyboard('{Enter}') })
    expect(logout).toHaveBeenCalledOnce()
    await act(async () => {
      resolveLogout?.({ kind: 'logged-out' })
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('announces unavailability and retries only through the explicit action', async () => {
    const logout = vi
      .fn<LogoutController['logout']>()
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'logged-out' })
    const user = userEvent.setup()
    const container = await renderDialog(controllerWith(logout))
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Cerrar sesión' })) })
    const dialog = screen.getByRole('dialog')

    await act(async () => {
      await user.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }))
    })

    expect(logout).toHaveBeenCalledOnce()
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'No pudimos cerrar la sesión. Puedes intentarlo nuevamente.',
    )
    const retry = within(dialog).getByRole('button', { name: 'Reintentar' })
    expect(retry).toBeTruthy()

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])

    await act(async () => { await user.click(retry) })
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
