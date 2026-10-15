import { StrictMode, act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  SecurityRecoveryController,
  SecurityRecoveryResult,
} from './security-recovery-controller'
import { SecurityRecoveryPanel } from './security-recovery-panel'

const roots: ReturnType<typeof createRoot>[] = []

function controllerStub({
  operation = 'refresh',
  restoreProtection,
  retryOriginal = () => Promise.resolve({ kind: 'dispatched' } as const),
}: {
  operation?: 'refresh' | 'logout'
  restoreProtection: () => Promise<SecurityRecoveryResult>
  retryOriginal?: SecurityRecoveryController['retryOriginal']
}): SecurityRecoveryController {
  return { operation, restoreProtection, retryOriginal }
}

async function renderPanel(controller: SecurityRecoveryController) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <SecurityRecoveryPanel controller={controller} />
      </StrictMode>,
    )
    await Promise.resolve()
  })
  return container
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  }
})

describe('SecurityRecoveryPanel', () => {
  it('shows only a generic quarantine message and never starts recovery on mount', async () => {
    const restoreProtection = vi.fn(() =>
      Promise.resolve({ kind: 'restored' } as const),
    )
    const container = await renderPanel(controllerStub({ restoreProtection }))

    expect(screen.getByText('No pudimos verificar la protección de tu sesión.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Restablecer protección' }),
    ).toBeTruthy()
    expect(restoreProtection).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/ana@|master|uuid|token|csrf/i)
  })

  it('blocks double activation and offers explicit retry only after success', async () => {
    let resolveRecovery: ((result: SecurityRecoveryResult) => void) | undefined
    const restoreProtection = vi.fn(
      () =>
        new Promise<SecurityRecoveryResult>((resolve) => {
          resolveRecovery = resolve
        }),
    )
    const retryOriginal = vi.fn(() =>
      Promise.resolve({ kind: 'dispatched' } as const),
    )
    const user = userEvent.setup()
    await renderPanel(controllerStub({ restoreProtection, retryOriginal }))

    await act(async () => { await user.dblClick(
      screen.getByRole('button', { name: 'Restablecer protección' }),
    ) })
    expect(restoreProtection).toHaveBeenCalledOnce()
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Restableciendo protección...',
      }).disabled,
    ).toBe(true)
    await act(async () => {
      resolveRecovery?.({ kind: 'restored' })
      await Promise.resolve()
    })

    expect(screen.getByRole('status').textContent).toContain(
      'La protección fue restablecida.',
    )
    expect(retryOriginal).not.toHaveBeenCalled()
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Reintentar' })) })
    await waitFor(() => {
      expect(retryOriginal).toHaveBeenCalledOnce()
    })
  })

  it.each([
    ['blocked', 'No pudimos verificar la protección de tu sesión.'],
    ['unavailable', 'No pudimos restablecer la protección. Inténtalo nuevamente.'],
  ] as const)('announces the generic %s outcome', async (kind, message) => {
    const user = userEvent.setup()
    const container = await renderPanel(
      controllerStub({
        restoreProtection: () => Promise.resolve({ kind }),
      }),
    )

    await act(async () => { await user.click(
      screen.getByRole('button', { name: 'Restablecer protección' }),
    ) })
    if (kind === 'blocked') {
      expect((await screen.findByRole('alert')).textContent).toContain(message)
    } else {
      expect((await screen.findByRole('status')).textContent).toContain(message)
    }
    expect(
      screen.getByRole('button', { name: 'Restablecer protección' }),
    ).toBeTruthy()

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
