import { act } from 'react'
import { notifyManager, QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { ApiError, classifyApiFailure } from '../../core/http/errors'
import { createSessionStore } from '../../core/session/session-store'
import { ToastProvider } from '../../shared/ui/toast-provider'
import { createTestQueryClient } from '../../test/create-test-query-client'
import type { ProfileApi } from './profile-api'
import { ProfilePageContent } from './profile-page'

const PROFILE: UserResponse = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  role: 'visualizer',
  is_active: true,
}

const roots: ReturnType<typeof createRoot>[] = []
const queryClients: ReturnType<typeof createTestQueryClient>[] = []

async function renderPage(profileApi: ProfileApi, profile: UserResponse = PROFILE) {
  const container = document.createElement('main')
  const root = createRoot(container)
  const queryClient = createTestQueryClient()
  queryClients.push(queryClient)
  const sessionStore = createSessionStore()
  roots.push(root)
  document.body.append(container)
  sessionStore.getState().stageTokens({
    accessToken: 'access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'csrf-value',
  })
  sessionStore.getState().completeSession({
    userUuid: profile.uuid,
    name: profile.name,
    lastName: profile.last_name,
    email: profile.email,
    phoneNumber: profile.phone_number,
    role: profile.role,
    isActive: profile.is_active,
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ProfilePageContent
            accountUuid={profile.uuid}
            navigate={vi.fn()}
            profileApi={profileApi}
            sessionStore={sessionStore}
          />
        </ToastProvider>
      </QueryClientProvider>,
    )
    await Promise.resolve()
  })
  return { container, queryClient, scope: within(container) }
}

async function settleReads(queryClient: ReturnType<typeof createTestQueryClient>) {
  await act(async () => {
    const reads = queryClient.getQueryCache().getAll()
      .map((query) => query.promise)
      .filter((promise) => promise !== undefined)
    await Promise.allSettled(reads)
    // Esperar también la notificación real de Query; no cambiar su scheduler ni sus datos.
    await new Promise<void>((resolve) => { notifyManager.schedule(resolve) })
  })
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.all(queryClients.map((client) => client.cancelQueries()))
  })
  for (const client of queryClients.splice(0)) client.clear()
})

describe('ProfilePageContent', () => {
  it('shows an accessible loading state without flashing private profile data', async () => {
    await renderPage({
      get: () => new Promise(() => undefined),
      update: vi.fn(),
    })

    expect(document.querySelector('[data-state="loading"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Cargando perfil')
    expect(document.body.textContent).not.toContain('ana@example.com')
  })

  it('renders the validated visualizer profile from the scoped query', async () => {
    const get = vi.fn<ProfileApi['get']>(() =>
      Promise.resolve({ kind: 'success', data: PROFILE }),
    )
    const { container, scope, queryClient } = await renderPage({ get, update: vi.fn() })
    await settleReads(queryClient)

    expect(await scope.findByRole('heading', { level: 1, name: 'Mi perfil' })).toBeTruthy()
    expect(await scope.findByText('Perfil de solo lectura')).toBeTruthy()
    expect(container.querySelectorAll('dt')).toHaveLength(6)
    expect(container.querySelector('form, input')).toBeNull()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('keeps unavailable query errors contextual and retries only by explicit action', async () => {
    const get = vi
      .fn<ProfileApi['get']>()
      .mockRejectedValueOnce(new ApiError(classifyApiFailure(503, { detail: 'private' })))
      .mockResolvedValueOnce({ kind: 'success', data: PROFILE })
    const user = userEvent.setup()
    const { scope, queryClient } = await renderPage({ get, update: vi.fn() })
    await settleReads(queryClient)

    expect(await scope.findByText('No pudimos cargar tu perfil')).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(1)
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Reintentar' })) })
    await settleReads(queryClient)

    expect(await scope.findByText('Perfil de solo lectura')).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(2)
    expect(window.location.pathname).not.toBe('/unavailable')
  })

  it('renders no private content for delegated session outcomes', async () => {
    const { container, queryClient } = await renderPage({
      get: () => Promise.resolve({ kind: 'session', state: 'dead' }),
      update: vi.fn(),
    })

    await settleReads(queryClient)
    expect(container.querySelector('form, dl')).toBeNull()
    expect(container.textContent).not.toContain('ana@example.com')
  })

  it('has no axe violations for the loaded editable page', async () => {
    const editable = { ...PROFILE, role: 'master' as const }
    const { container, scope, queryClient } = await renderPage(
      {
        get: () => Promise.resolve({ kind: 'success', data: editable }),
        update: vi.fn(),
      },
      editable,
    )
    await settleReads(queryClient)
    await scope.findByRole('form', { name: 'Editar perfil' })

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
