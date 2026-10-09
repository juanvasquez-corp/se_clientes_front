import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import type { MutationOutcome } from '../../core/http/api-client'
import { createSessionStore, type SessionStore } from '../../core/session/session-store'
import { ToastProvider } from '../../shared/ui/toast-provider'
import { createTestQueryClient } from '../../test/create-test-query-client'
import type { ProfileApi } from './profile-api'
import { profileQueryKey } from './profile-query'
import { ProfileUpdateWorkflow } from './profile-update-workflow'

const ACCOUNT_A = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const ACCOUNT_B = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const PROFILE: UserResponse = {
  uuid: ACCOUNT_A,
  name: 'Ana',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: '+57 300 123 4567',
  rol: 'master',
  is_active: true,
}

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly reject: (error: unknown) => void
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined
  let rejectPromise: ((error: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    reject(error) {
      rejectPromise?.(error)
    },
    resolve(value) {
      resolvePromise?.(value)
    },
  }
}

function authenticate(store: SessionStore, profile: UserResponse): void {
  store.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  store.getState().completeSession({
    userUuid: profile.uuid,
    name: profile.name,
    lastName: profile.last_name,
    email: profile.email,
    phoneNumber: profile.phone_number,
    role: profile.rol,
    isActive: profile.is_active,
  })
}

const roots: ReturnType<typeof createRoot>[] = []

function renderWorkflow({
  profile = PROFILE,
  update,
}: {
  profile?: UserResponse
  update: ProfileApi['update']
}) {
  const container = document.createElement('main')
  const root = createRoot(container)
  const queryClient = createTestQueryClient()
  const sessionStore = createSessionStore()
  roots.push(root)
  document.body.append(container)
  authenticate(sessionStore, profile)
  queryClient.setQueryData(profileQueryKey(profile.uuid), {
    kind: 'success',
    data: profile,
  })
  const api: Pick<ProfileApi, 'update'> = { update }
  const render = (currentProfile: UserResponse) => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ProfileUpdateWorkflow
              profile={currentProfile}
              profileApi={api}
              sessionStore={sessionStore}
            />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
  }
  render(profile)

  return {
    container,
    queryClient,
    render,
    root,
    scope: within(container),
    sessionStore,
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('ProfileUpdateWorkflow', () => {
  it('allows one PUT while pending and protects submit, Enter and cancel', async () => {
    const request = deferred<MutationOutcome<UserResponse>>()
    const update = vi.fn<ProfileApi['update']>(() => request.promise)
    const user = userEvent.setup()
    const { container, scope } = renderWorkflow({ update })
    const save = scope.getByRole('button', { name: 'Guardar cambios' })

    await user.dblClick(save)
    await user.keyboard('{Enter}')

    expect(update).toHaveBeenCalledTimes(1)
    expect(scope.getByRole('status').textContent).toContain('Guardando tus cambios.')
    expect(scope.getByRole<HTMLButtonElement>('button', { name: 'Guardando…' }).disabled).toBe(
      true,
    )
    expect(scope.getByRole<HTMLButtonElement>('button', { name: 'Cancelar' }).disabled).toBe(
      true,
    )
    expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true)

    await act(async () => {
      request.resolve({ kind: 'success', data: PROFILE })
      await request.promise
    })
  })

  it('uses the strict backend response for cache, identity, reset and one success toast', async () => {
    window.history.replaceState(null, '', '/profile')
    const confirmed = {
      ...PROFILE,
      name: 'Ana Confirmada',
      last_name: null,
      email: 'confirmed@example.com',
      phone_number: null,
    }
    const update = vi.fn<ProfileApi['update']>(() =>
      Promise.resolve({ kind: 'success', data: confirmed }),
    )
    const user = userEvent.setup()
    const { queryClient, scope, sessionStore } = renderWorkflow({ update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await user.clear(name)
    await user.type(name, 'Valor local')
    await user.click(scope.getByRole('button', { name: 'Guardar cambios' }))

    expect(await scope.findByText('Cambios guardados correctamente.')).toBeTruthy()
    expect(scope.getAllByRole('status')).toHaveLength(1)
    expect(window.location.pathname).toBe('/profile')
    expect(name.value).toBe('Ana Confirmada')
    expect(scope.getByRole<HTMLInputElement>('textbox', { name: /^apellido/i }).value).toBe('')
    expect(scope.getByRole<HTMLInputElement>('textbox', { name: /^teléfono/i }).value).toBe('')
    expect(queryClient.getQueryData(profileQueryKey(ACCOUNT_A))).toEqual({
      kind: 'success',
      data: confirmed,
    })
    expect(sessionStore.getState().identity).toMatchObject({
      userUuid: ACCOUNT_A,
      name: 'Ana Confirmada',
      lastName: null,
      email: 'confirmed@example.com',
      phoneNumber: null,
    })
  })

  it('cancels dirty and invalid values with zero request and no toast', async () => {
    const update = vi.fn<ProfileApi['update']>()
    const user = userEvent.setup()
    const { container, scope } = renderWorkflow({
      profile: { ...PROFILE, last_name: null, phone_number: null },
      update,
    })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await user.clear(name)
    await user.click(scope.getByRole('button', { name: 'Guardar cambios' }))
    expect(container.querySelector('[aria-invalid="true"]')).toBe(name)
    await user.click(scope.getByRole('button', { name: 'Cancelar' }))

    expect(name.value).toBe('Ana')
    expect(scope.getByRole<HTMLInputElement>('textbox', { name: /^apellido/i }).value).toBe('')
    expect(scope.getByRole<HTMLInputElement>('textbox', { name: /^teléfono/i }).value).toBe('')
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(update).not.toHaveBeenCalled()
    expect(scope.queryByText('Cambios guardados correctamente.')).toBeNull()
  })

  it('uses the newest confirmed response as the next cancel baseline without duplicate toast', async () => {
    const responses = [
      { ...PROFILE, name: 'Primera confirmación' },
      { ...PROFILE, name: 'Segunda confirmación', email: 'second@example.com' },
    ]
    const update = vi.fn<ProfileApi['update']>(() =>
      Promise.resolve({ kind: 'success', data: responses.shift() ?? PROFILE }),
    )
    const user = userEvent.setup()
    const { scope } = renderWorkflow({ update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await user.clear(name)
    await user.type(name, 'Primera edición')
    await user.click(scope.getByRole('button', { name: 'Guardar cambios' }))
    await scope.findByText('Cambios guardados correctamente.')
    await user.clear(name)
    await user.type(name, 'Segunda edición')
    await user.click(scope.getByRole('button', { name: 'Guardar cambios' }))
    await user.clear(name)
    await user.type(name, 'Cambio sin guardar')
    await user.click(scope.getByRole('button', { name: 'Cancelar' }))

    expect(update).toHaveBeenCalledTimes(2)
    expect(name.value).toBe('Segunda confirmación')
    expect(scope.getByRole<HTMLInputElement>('textbox', { name: /correo electrónico/i }).value).toBe(
      'second@example.com',
    )
    expect(scope.getAllByText('Cambios guardados correctamente.')).toHaveLength(1)
  })

  it('does not retry a failed update and preserves the written values', async () => {
    const update = vi.fn<ProfileApi['update']>(() =>
      Promise.reject(new Error('sanitized failure')),
    )
    const user = userEvent.setup()
    const { scope } = renderWorkflow({ update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await user.clear(name)
    await user.type(name, 'Cambio preservado')
    await user.click(scope.getByRole('button', { name: 'Guardar cambios' }))

    expect((await scope.findByRole('alert')).textContent).toContain(
      'Tus cambios siguen disponibles. Intenta nuevamente.',
    )
    expect(name.value).toBe('Cambio preservado')
    expect(update).toHaveBeenCalledTimes(1)
    expect(scope.queryByText('Cambios guardados correctamente.')).toBeNull()
  })

  it('aborts and ignores an old account response after account replacement', async () => {
    const request = deferred<MutationOutcome<UserResponse>>()
    let requestSignal: AbortSignal | undefined
    const update = vi.fn<ProfileApi['update']>((_payload, signal) => {
      requestSignal = signal
      return request.promise
    })
    const user = userEvent.setup()
    const port = renderWorkflow({ update })

    await user.click(port.scope.getByRole('button', { name: 'Guardar cambios' }))
    const profileB: UserResponse = {
      ...PROFILE,
      uuid: ACCOUNT_B,
      name: 'Bea',
      email: 'bea@example.com',
    }
    port.queryClient.setQueryData(profileQueryKey(ACCOUNT_B), {
      kind: 'success',
      data: profileB,
    })
    port.sessionStore.getState().markDead()
    authenticate(port.sessionStore, profileB)
    port.render(profileB)

    expect(requestSignal?.aborted).toBe(true)
    await act(async () => {
      request.resolve({ kind: 'success', data: { ...PROFILE, name: 'Respuesta tardía' } })
      await request.promise
    })

    expect(port.queryClient.getQueryData(profileQueryKey(ACCOUNT_A))).toEqual({
      kind: 'success',
      data: PROFILE,
    })
    expect(port.queryClient.getQueryData(profileQueryKey(ACCOUNT_B))).toEqual({
      kind: 'success',
      data: profileB,
    })
    expect(port.sessionStore.getState().identity?.userUuid).toBe(ACCOUNT_B)
    expect(port.scope.queryByText('Cambios guardados correctamente.')).toBeNull()
  })

  it('aborts pending work on unmount and never writes late data', async () => {
    const request = deferred<MutationOutcome<UserResponse>>()
    let requestSignal: AbortSignal | undefined
    const update = vi.fn<ProfileApi['update']>((_payload, signal) => {
      requestSignal = signal
      return request.promise
    })
    const user = userEvent.setup()
    const port = renderWorkflow({ update })

    await user.click(port.scope.getByRole('button', { name: 'Guardar cambios' }))
    act(() => {
      port.root.unmount()
    })
    roots.splice(roots.indexOf(port.root), 1)
    expect(requestSignal?.aborted).toBe(true)
    await act(async () => {
      request.resolve({ kind: 'success', data: { ...PROFILE, name: 'Respuesta tardía' } })
      await request.promise
    })

    expect(port.queryClient.getQueryData(profileQueryKey(ACCOUNT_A))).toEqual({
      kind: 'success',
      data: PROFILE,
    })
  })

  it('has no axe violations while pending', async () => {
    const request = deferred<MutationOutcome<UserResponse>>()
    const user = userEvent.setup()
    const { container, scope } = renderWorkflow({ update: () => request.promise })

    await user.click(scope.getByRole('button', { name: 'Guardar cambios' }))
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])

    await act(async () => {
      request.resolve({ kind: 'success', data: PROFILE })
      await request.promise
    })
  })
})
