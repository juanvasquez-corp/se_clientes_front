import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { waitFor, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import {
  createApiClient,
  type MutationOutcome,
  type RecoveryResult,
} from '../../core/http/api-client'
import { ApiError, ContractError, classifyApiFailure } from '../../core/http/errors'
import { createSessionStore, type SessionStore } from '../../core/session/session-store'
import { ToastProvider } from '../../shared/ui/toast-provider'
import { createTestQueryClient } from '../../test/create-test-query-client'
import { server } from '../../test/server'
import { createProfileApi, type ProfileApi } from './profile-api'
import { profileQueryKey } from './profile-query'
import { ProfileUpdateWorkflow } from './profile-update-workflow'

const ACCOUNT_A = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const ACCOUNT_B = 'f55e8c53-f579-4134-980b-84c95acb18ce'
const API_BASE_URL = 'https://api.example.test/api'
const PROFILE_URL = `${API_BASE_URL}/users/me`
const PROFILE: UserResponse = {
  uuid: ACCOUNT_A,
  name: 'Ana',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: '+57 300 123 4567',
  role: 'master',
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
    role: profile.role,
    isActive: profile.is_active,
  })
}

const roots: ReturnType<typeof createRoot>[] = []
const queryClients: ReturnType<typeof createTestQueryClient>[] = []

async function renderWorkflow({
  navigate = vi.fn(),
  profile = PROFILE,
  update,
}: {
  navigate?: (destination: '/forbidden' | '/login' | '/unavailable') => void
  profile?: UserResponse
  update: ProfileApi['update']
}) {
  const container = document.createElement('main')
  const root = createRoot(container)
  const queryClient = createTestQueryClient()
  queryClients.push(queryClient)
  const sessionStore = createSessionStore()
  roots.push(root)
  document.body.append(container)
  authenticate(sessionStore, profile)
  queryClient.setQueryData(profileQueryKey(profile.uuid), {
    kind: 'success',
    data: profile,
  })
  const api: Pick<ProfileApi, 'update'> = { update }
  const render = async (currentProfile: UserResponse) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ProfileUpdateWorkflow
              profile={currentProfile}
              profileApi={api}
              sessionStore={sessionStore}
              navigate={navigate}
            />
          </ToastProvider>
        </QueryClientProvider>,
      )
      await Promise.resolve()
    })
  }
  await render(profile)

  return {
    container,
    navigate,
    queryClient,
    render,
    root,
    scope: within(container),
    sessionStore,
  }
}

function createNetworkProfileApi(recovery: RecoveryResult = 'dead'): ProfileApi {
  return createProfileApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'profile-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve(recovery) },
    }),
  })
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.all(queryClients.map((client) => client.cancelQueries()))
  })
  for (const client of queryClients.splice(0)) client.clear()
})

describe('ProfileUpdateWorkflow', () => {
  it('allows one PUT while pending and protects submit, Enter and cancel', async () => {
    const request = deferred<MutationOutcome<UserResponse>>()
    const update = vi.fn<ProfileApi['update']>(() => request.promise)
    const user = userEvent.setup()
    const { container, scope } = await renderWorkflow({ update })
    const save = scope.getByRole('button', { name: 'Guardar cambios' })

    await act(async () => { await user.dblClick(save) })
    await act(async () => { await user.keyboard('{Enter}') })

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
    const { queryClient, scope, sessionStore } = await renderWorkflow({ update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, 'Valor local') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

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
    const { container, scope } = await renderWorkflow({
      profile: { ...PROFILE, last_name: null, phone_number: null },
      update,
    })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await act(async () => { await user.clear(name) })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })
    expect(container.querySelector('[aria-invalid="true"]')).toBe(name)
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Cancelar' })) })

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
    const { scope } = await renderWorkflow({ update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, 'Primera edición') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })
    await scope.findByText('Cambios guardados correctamente.')
    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, 'Segunda edición') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })
    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, 'Cambio sin guardar') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Cancelar' })) })

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
    const { scope } = await renderWorkflow({ update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, 'Cambio preservado') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

    expect((await scope.findByRole('alert')).textContent).toContain(
      'No fue posible guardar los cambios de forma segura.',
    )
    expect(name.value).toBe('Cambio preservado')
    expect(update).toHaveBeenCalledTimes(1)
    expect(scope.queryByText('Cambios guardados correctamente.')).toBeNull()
  })

  it('requires an explicit second save after one recovered 401 and never replays PUT', async () => {
    let requests = 0
    server.use(
      http.put(PROFILE_URL, () => {
        requests += 1
        return requests === 1
          ? HttpResponse.json({ detail: 'expired' }, { status: 401 })
          : HttpResponse.json({ ...PROFILE, name: 'Confirmado tras renovar' })
      }),
    )
    const user = userEvent.setup()
    const api = createNetworkProfileApi('recovered')
    const { scope } = await renderWorkflow({ update: api.update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, 'Cambio preservado') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

    expect(await scope.findByText('Tu sesión fue renovada. Confirma para guardar.')).toBeTruthy()
    expect(name.value).toBe('Cambio preservado')
    expect(requests).toBe(1)

    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })
    expect(await scope.findByText('Cambios guardados correctamente.')).toBeTruthy()
    expect(requests).toBe(2)
    expect(name.value).toBe('Confirmado tras renovar')
  })

  it('preserves context and shows only a validated 409 explanation without retry', async () => {
    let requests = 0
    server.use(
      http.put(PROFILE_URL, () => {
        requests += 1
        return requests === 1
          ? HttpResponse.json(
              { detail: 'El correo ya está reservado.' },
              { status: 409 },
            )
          : HttpResponse.json({
              ...PROFILE,
              email: 'reservado@example.com',
            })
      }),
    )
    const user = userEvent.setup()
    const api = createNetworkProfileApi()
    const { queryClient, scope } = await renderWorkflow({ update: api.update })
    const email = scope.getByRole<HTMLInputElement>('textbox', { name: /correo electrónico/i })

    await act(async () => { await user.clear(email) })
    await act(async () => { await user.type(email, 'reservado@example.com') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

    expect(await scope.findByText('El correo ya está reservado.')).toBeTruthy()
    expect(email.value).toBe('reservado@example.com')
    expect(requests).toBe(1)
    expect(queryClient.getQueryData(profileQueryKey(ACCOUNT_A))).toEqual({
      kind: 'success',
      data: PROFILE,
    })

    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })
    expect(await scope.findByText('Cambios guardados correctamente.')).toBeTruthy()
    expect(scope.queryByText('El correo ya está reservado.')).toBeNull()
    expect(requests).toBe(2)
  })

  it('maps sanitized 422 issues to four allowed fields, focuses first and keeps unknown general', async () => {
    let requests = 0
    server.use(
      http.put(PROFILE_URL, () => {
        requests += 1
        return HttpResponse.json(
          {
            detail: [
              { type: 'value_error', loc: ['body', 'name'], msg: 'Nombre rechazado' },
              { type: 'value_error', loc: ['body', 'email'], msg: 'Correo rechazado' },
              {
                type: 'value_error',
                loc: ['body', 'document_number'],
                msg: 'Mensaje desconocido',
                input: 'private-input',
                ctx: { private: 'private-context' },
              },
            ],
          },
          { status: 422 },
        )
      }),
    )
    const user = userEvent.setup()
    const api = createNetworkProfileApi()
    const { container, scope } = await renderWorkflow({ update: api.update })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })
    const email = scope.getByRole<HTMLInputElement>('textbox', { name: /correo electrónico/i })

    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

    expect(await scope.findByText('Nombre rechazado')).toBeTruthy()
    expect(scope.getByText('Correo rechazado')).toBeTruthy()
    expect(scope.getByText('Revisa los campos señalados y vuelve a intentar.')).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement).toBe(name)
    })
    expect(email.value).toBe('ana@example.com')
    expect(container.textContent).not.toMatch(/Mensaje desconocido|private-input|private-context/)
    expect(requests).toBe(1)

    await act(async () => { await user.click(scope.getByRole('button', { name: 'Cancelar' })) })
    expect(scope.queryByText('Nombre rechazado')).toBeNull()
    expect(scope.queryByText('Correo rechazado')).toBeNull()
    expect(scope.queryByText('Revisa los campos señalados y vuelve a intentar.')).toBeNull()
  })

  it.each([
    ['network', undefined],
    ['503', 503],
  ] as const)(
    'keeps /profile and offers explicit retry for %s unavailability',
    async (_case, status) => {
      window.history.replaceState(null, '', '/profile')
      let requests = 0
      server.use(
        http.put(PROFILE_URL, () => {
          requests += 1
          return status === undefined
            ? HttpResponse.error()
            : HttpResponse.json({ detail: 'private-body' }, { status })
        }),
      )
      const user = userEvent.setup()
      const api = createNetworkProfileApi()
      const { container, navigate, scope } = await renderWorkflow({ update: api.update })
      const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

      await act(async () => { await user.clear(name) })
      await act(async () => { await user.type(name, 'Cambio preservado') })
      await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

      expect(await scope.findByText('El servicio no está disponible.')).toBeTruthy()
      expect(scope.getByRole('button', { name: 'Reintentar guardado' })).toBeTruthy()
      expect(name.value).toBe('Cambio preservado')
      expect(requests).toBe(1)
      expect(window.location.pathname).toBe('/profile')
      expect(navigate).not.toHaveBeenCalled()
      expect(container.textContent).not.toContain('private-body')
      const results = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(results.violations).toEqual([])

      await act(async () => { await user.click(scope.getByRole('button', { name: 'Reintentar guardado' })) })
      expect(requests).toBe(2)
    },
  )

  it.each([
    ['dead', '/login'],
    ['blocked', '/forbidden'],
    ['unavailable', '/unavailable'],
  ] as const)(
    'hides profile context and navigates after mutation session outcome %s',
    async (recovery, destination) => {
      let requests = 0
      server.use(
        http.put(PROFILE_URL, () => {
          requests += 1
          return HttpResponse.json({ detail: 'expired' }, { status: 401 })
        }),
      )
      const user = userEvent.setup()
      const api = createNetworkProfileApi(recovery)
      const port = await renderWorkflow({ update: api.update })

      await act(async () => { await user.click(port.scope.getByRole('button', { name: 'Guardar cambios' })) })

      expect(port.navigate).toHaveBeenCalledWith(destination)
      expect(port.sessionStore.getState().status).toBe(recovery)
      expect(requests).toBe(1)
      if (recovery === 'dead') {
        expect(port.queryClient.getQueryCache().getAll()).toHaveLength(0)
      } else {
        expect(port.container.querySelector('form')).toBeNull()
      }
    },
  )

  it.each([
    [new ApiError(classifyApiFailure(400, { detail: 'raw body' })), 'Error técnico'],
    [new ContractError('invalid-shape'), 'Error técnico'],
  ])('shows a controlled safe fallback for non-specialized failures', async (failure, title) => {
    const update = vi.fn<ProfileApi['update']>(() => Promise.reject(failure))
    const user = userEvent.setup()
    const { container, scope } = await renderWorkflow({ update })

    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

    expect(await scope.findByText(title)).toBeTruthy()
    expect(container.textContent).not.toMatch(/raw body|invalid-shape|Axios|profile-access-value/)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('navigates a controlled functional 403 without exposing its body', async () => {
    const failure = new ApiError(classifyApiFailure(403, { detail: 'private-body' }))
    const update = vi.fn<ProfileApi['update']>(() => Promise.reject(failure))
    const user = userEvent.setup()
    const { container, navigate, scope } = await renderWorkflow({ update })

    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

    expect(navigate).toHaveBeenCalledWith('/forbidden')
    expect(container.textContent).not.toContain('private-body')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('aborts and ignores an old account response after account replacement', async () => {
    const request = deferred<MutationOutcome<UserResponse>>()
    let requestSignal: AbortSignal | undefined
    const update = vi.fn<ProfileApi['update']>((_payload, signal) => {
      requestSignal = signal
      return request.promise
    })
    const user = userEvent.setup()
    const port = await renderWorkflow({ update })

    await act(async () => { await user.click(port.scope.getByRole('button', { name: 'Guardar cambios' })) })
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
    await act(async () => {
      port.sessionStore.getState().markDead()
      authenticate(port.sessionStore, profileB)
      await port.render(profileB)
    })

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
    const port = await renderWorkflow({ update })

    await act(async () => { await user.click(port.scope.getByRole('button', { name: 'Guardar cambios' })) })
    await act(async () => {
      port.root.unmount()
      await Promise.resolve()
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
    const { container, scope } = await renderWorkflow({ update: () => request.promise })

    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })
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
