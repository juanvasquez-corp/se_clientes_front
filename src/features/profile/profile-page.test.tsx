import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
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
  rol: 'visualizer',
  is_active: true,
}

const roots: ReturnType<typeof createRoot>[] = []

function renderPage(profileApi: ProfileApi, profile: UserResponse = PROFILE) {
  const container = document.createElement('main')
  const root = createRoot(container)
  const queryClient = createTestQueryClient()
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
    role: profile.rol,
    isActive: profile.is_active,
  })
  act(() => {
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
  })
  return { container, queryClient, scope: within(container) }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('ProfilePageContent', () => {
  it('shows an accessible loading state without flashing private profile data', () => {
    renderPage({
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
    const { container, scope } = renderPage({ get, update: vi.fn() })

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
    const { scope } = renderPage({ get, update: vi.fn() })

    expect(await scope.findByText('No pudimos cargar tu perfil')).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(1)
    await user.click(scope.getByRole('button', { name: 'Reintentar' }))

    expect(await scope.findByText('Perfil de solo lectura')).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(2)
    expect(window.location.pathname).not.toBe('/unavailable')
  })

  it('renders no private content for delegated session outcomes', async () => {
    const { container } = renderPage({
      get: () => Promise.resolve({ kind: 'session', state: 'dead' }),
      update: vi.fn(),
    })

    await act(async () => Promise.resolve())
    expect(container.querySelector('form, dl')).toBeNull()
    expect(container.textContent).not.toContain('ana@example.com')
  })

  it('has no axe violations for the loaded editable page', async () => {
    const editable = { ...PROFILE, rol: 'master' as const }
    const { container, scope } = renderPage(
      {
        get: () => Promise.resolve({ kind: 'success', data: editable }),
        update: vi.fn(),
      },
      editable,
    )
    await scope.findByRole('form', { name: 'Editar perfil' })

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
