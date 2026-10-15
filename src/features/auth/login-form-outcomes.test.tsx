import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { HttpResponse, http } from 'msw'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { createApiClient } from '../../core/http/api-client'
import { createAuthClient } from '../../core/http/auth-client'
import { createAuthApi } from '../../core/session/auth-api'
import { createSessionStore } from '../../core/session/session-store'
import { server } from '../../test/server'
import {
  directCriticalOperations,
  silentSessionSignals,
} from '../../test/session-test-ports'
import { LoginForm } from './login-form'

const API_BASE_URL = 'https://api.example.test/api'
const PASSWORD = 'private password value'
const TOKEN_RESPONSE = {
  access_token: 'private-access-value',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'private-csrf-value',
}

const roots: ReturnType<typeof createRoot>[] = []

function createRealLoginPort() {
  const sessionStore = createSessionStore()
  const authClient = createAuthClient({
    apiBaseUrl: API_BASE_URL,
    getCsrfToken: () => sessionStore.getState().csrfToken,
  })
  const apiClient = createApiClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => sessionStore.getState().accessToken,
    sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
  })

  return {
    sessionStore,
    login: createAuthApi({
      authClient,
      apiClient,
      sessionStore,
      criticalOperations: directCriticalOperations,
      sessionSignals: silentSessionSignals,
    }).login,
  }
}

async function renderLoginForm() {
  const port = createRealLoginPort()
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  await act(async () => {
    root.render(<LoginForm onSubmit={port.login} />)
    await Promise.resolve()
  })

  return { container, ...port }
}

async function enterCredentials(user: ReturnType<typeof userEvent.setup>) {
  const email = screen.getByRole<HTMLInputElement>('textbox', {
    name: /correo electrónico/i,
  })
  const password = screen.getByLabelText<HTMLInputElement>(
    /^contraseña.*obligatorio/i,
  )

  await act(async () => { await user.type(email, '  ANA@Example.COM  ') })
  await act(async () => { await user.type(password, PASSWORD) })
  await act(async () => { await user.click(screen.getByRole('button', { name: 'Ingresar' })) })

  return { email, password }
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  }
})

describe('LoginForm failure outcomes', () => {
  it.each([
    'Credenciales incorrectas',
    'Cuenta inactiva',
    'Cuenta eliminada',
  ])('shows the same sanitized feedback for login 401: %s', async (detail) => {
    let requests = 0
    server.use(
      http.post('https://api.example.test/api/auth/login', () => {
        requests += 1
        return HttpResponse.json({ detail }, { status: 401 })
      }),
    )
    const user = userEvent.setup()
    await renderLoginForm()

    const { email, password } = await enterCredentials(user)
    const feedback = await screen.findByRole('alert')

    expect(feedback.textContent).toContain(
      'No fue posible iniciar sesión con esas credenciales.',
    )
    expect(feedback.textContent).not.toMatch(/correo|contraseña|inactiva|eliminada/i)
    expect(email.value).toBe('ana@example.com')
    expect(password.value).toBe('')
    expect(document.activeElement).toBe(feedback.parentElement)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Ingresar' }).disabled).toBe(
      false,
    )
    expect(document.body.textContent).not.toContain(PASSWORD)
    expect(requests).toBe(1)
  })

  it.each([
    ['network', () => HttpResponse.error()],
    [
      '503',
      () => HttpResponse.json({ detail: 'Database unavailable' }, { status: 503 }),
    ],
  ] as const)(
    'clears the password and requires a manual retry after %s failure',
    async (_case, response) => {
      let requests = 0
      server.use(
        http.post('https://api.example.test/api/auth/login', () => {
          requests += 1
          return response()
        }),
      )
      const user = userEvent.setup()
      const { container } = await renderLoginForm()

      const { email, password } = await enterCredentials(user)
      const feedback = await screen.findByRole('alert')
      const retry = screen.getByRole('button', {
        name: 'Volver a ingresar la contraseña',
      })

      expect(feedback.textContent).toContain(
        'El servicio no está disponible. Vuelve a ingresar tu contraseña e intenta de nuevo.',
      )
      expect(feedback.textContent).not.toMatch(/503|database|network|axios/i)
      expect(email.value).toBe('ana@example.com')
      expect(password.value).toBe('')
      expect(requests).toBe(1)

      email.focus()
      await act(async () => { await user.click(retry) })
      expect(document.activeElement).toBe(password)
      expect(requests).toBe(1)

      await act(async () => { await user.type(password, 'new private password') })
      await act(async () => { await user.click(screen.getByRole('button', { name: 'Ingresar' })) })
      await waitFor(() => {
        expect(requests).toBe(2)
      })

      const results = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(results.violations).toEqual([])
    },
  )

  it('shows controlled technical feedback and clears partial session state', async () => {
    server.use(
      http.post('https://api.example.test/api/auth/login', () =>
        HttpResponse.json(TOKEN_RESPONSE),
      ),
      http.get('https://api.example.test/api/users/me', () =>
        HttpResponse.json({ uuid: 'invalid-profile' }),
      ),
    )
    const user = userEvent.setup()
    const { sessionStore } = await renderLoginForm()

    const { email, password } = await enterCredentials(user)
    const feedback = await screen.findByRole('alert')

    expect(feedback.textContent).toContain(
      'No fue posible completar el inicio de sesión. Intenta de nuevo.',
    )
    expect(email.value).toBe('ana@example.com')
    expect(password.value).toBe('')
    expect(sessionStore.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(JSON.stringify(sessionStore.getState())).not.toContain(
      TOKEN_RESPONSE.access_token,
    )
  })
})
