import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LoginOutcome } from '../../core/session/auth-api'
import { LoginForm } from './login-form'
import type { LoginInput } from './login-schema'

const TODAY = new Date('2026-10-07T12:00:00.000Z')
const roots = new Set<ReturnType<typeof createRoot>>()

function renderRateLimitedForm(
  retryAfter: string | null,
  now: () => Date = () => new Date(),
) {
  const onSubmit = vi.fn<(input: LoginInput) => Promise<LoginOutcome>>(() =>
    Promise.resolve({ kind: 'rate-limited', retryAfter }),
  )
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.add(root)
  document.body.append(container)

  act(() => {
    root.render(<LoginForm now={now} onSubmit={onSubmit} />)
  })

  return {
    container,
    onSubmit,
    unmount() {
      act(() => {
        root.unmount()
      })
      roots.delete(root)
    },
  }
}

function controls() {
  return {
    email: screen.getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico/i,
    }),
    password: screen.getByLabelText<HTMLInputElement>(
      /^contraseña.*obligatorio/i,
    ),
    reveal: screen.getByRole<HTMLButtonElement>('button', {
      name: 'Mostrar contraseña',
    }),
    submit: screen.getByRole<HTMLButtonElement>('button', { name: 'Ingresar' }),
  }
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  const fields = controls()
  await user.type(fields.email, 'ana@example.com')
  await user.type(fields.password, 'private password')
  await user.click(fields.submit)
  await act(async () => {
    await Promise.resolve()
  })
  return fields
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('LoginForm rate limiting', () => {
  it.each([
    ['positive seconds', '2', 2_000],
    ['zero seconds', '0', 0],
    ['future HTTP-date', 'Wed, 07 Oct 2026 12:00:02 GMT', 2_000],
    ['past HTTP-date', 'Wed, 07 Oct 2026 11:59:59 GMT', 0],
    ['missing or unreadable header', null, 300_000],
    ['malformed header', 'not-a-retry-date', 300_000],
  ])(
    'uses the exact lock duration for %s',
    async (_case, retryAfter, lockMs) => {
      vi.useFakeTimers()
      vi.setSystemTime(TODAY)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { onSubmit } = renderRateLimitedForm(retryAfter)

      const fields = await submitCredentials(user)
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain(
        lockMs === 0
          ? 'El límite de intentos finalizó. Puedes intentarlo de nuevo.'
          : 'Los intentos están temporalmente limitados.',
      )
      expect(fields.email.value).toBe('ana@example.com')
      expect(fields.password.value).toBe('')
      expect(onSubmit).toHaveBeenCalledTimes(1)

      if (lockMs === 0) {
        expect(fields.submit.disabled).toBe(false)
        expect(vi.getTimerCount()).toBe(0)
        return
      }

      expect(fields.email.disabled).toBe(true)
      expect(fields.password.disabled).toBe(true)
      expect(fields.reveal.disabled).toBe(true)
      expect(fields.submit.disabled).toBe(true)

      await user.click(fields.submit)
      await user.keyboard('{Enter}')
      expect(onSubmit).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(lockMs - 1)
      })
      expect(fields.submit.disabled).toBe(true)
      expect(onSubmit).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(fields.submit.disabled).toBe(false)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(onSubmit).toHaveBeenCalledTimes(1)
    },
  )

  it('chunks a representable duration beyond the setTimeout limit without early unlock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit } = renderRateLimitedForm('2147485')

    const { submit } = await submitCredentials(user)
    expect(submit.disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_147_483_647)
    })
    expect(submit.disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_352)
    })
    expect(submit.disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(submit.disabled).toBe(false)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('cleans its timer and remounts unlocked without persistence or automatic retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    const storageSetItem = vi.spyOn(Storage.prototype, 'setItem')
    const storageRemoveItem = vi.spyOn(Storage.prototype, 'removeItem')
    const storageClear = vi.spyOn(Storage.prototype, 'clear')
    const initialCookie = document.cookie
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const first = renderRateLimitedForm('120')

    const { submit } = await submitCredentials(user)
    expect(submit.disabled).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    first.unmount()
    expect(vi.getTimerCount()).toBe(0)

    const second = renderRateLimitedForm('120')
    expect(controls().submit.disabled).toBe(false)
    expect(second.onSubmit).not.toHaveBeenCalled()
    expect(storageSetItem).not.toHaveBeenCalled()
    expect(storageRemoveItem).not.toHaveBeenCalled()
    expect(storageClear).not.toHaveBeenCalled()
    expect(document.cookie).toBe(initialCookie)
  })

  it('has no axe violations while the temporary lock is announced', async () => {
    const user = userEvent.setup()
    const { container } = renderRateLimitedForm('60', () => TODAY)

    await submitCredentials(user)
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
