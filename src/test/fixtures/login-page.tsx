import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createApiClient } from '../../core/http/api-client'
import { createAuthClient } from '../../core/http/auth-client'
import { createAuthApi, type LoginOutcome } from '../../core/session/auth-api'
import { createSessionStore } from '../../core/session/session-store'
import { userRoleSchema } from '../../contracts/schemas/user'
import { LoginPage } from '../../features/auth/login-page'
import { parsePublicEnv } from '../../config/env'
import {
  directCriticalOperations,
  silentSessionSignals,
} from '../session-test-ports'
import '../../styles/app.css'

declare global {
  interface Window {
    __loginFixtureCleanup?: () => Promise<void>
    __loginFixtureState?: () => {
      hasAccessToken: boolean
      hasCsrfToken: boolean
      role: string | undefined
      status: string
    }
  }
}

const rootElement = document.getElementById('fixture-root')

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz del fixture de login.')
}

const sessionStore = createSessionStore()
const parameters = new URLSearchParams(window.location.search)
const fixtureRole = userRoleSchema.safeParse(parameters.get('role'))
const authClient = createAuthClient({
  apiBaseUrl: parsePublicEnv(import.meta.env).apiBaseUrl,
  getCsrfToken: () => sessionStore.getState().csrfToken,
})
const apiClient = createApiClient({
  apiBaseUrl: parsePublicEnv(import.meta.env).apiBaseUrl,
  getAccessToken: () => sessionStore.getState().accessToken,
  sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
})
const authApi = createAuthApi({
  authClient,
  apiClient,
  sessionStore,
  criticalOperations: directCriticalOperations,
  sessionSignals: silentSessionSignals,
})

if (fixtureRole.success) {
  sessionStore.getState().stageTokens({
    accessToken: 'fixture-access',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'fixture-csrf',
  })
  sessionStore.getState().completeSession({
    userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
    name: 'Fixture',
    lastName: null,
    email: 'fixture@example.test',
    phoneNumber: null,
    role: fixtureRole.data,
    isActive: true,
  })
}

window.__loginFixtureState = () => {
  const state = sessionStore.getState()
  return {
    hasAccessToken: state.accessToken !== undefined,
    hasCsrfToken: state.csrfToken !== undefined,
    role: state.identity?.role,
    status: state.status,
  }
}
window.__loginFixtureCleanup = async () => {
  await authClient.logout()
  sessionStore.getState().clearSession()
}

function simulatedLogin(): Promise<LoginOutcome> {
  switch (parameters.get('scenario')) {
    case '401':
      return Promise.resolve({ kind: 'credentials-rejected' })
    case '429':
      return Promise.resolve({ kind: 'rate-limited', retryAfter: '120' })
    case '503':
      return Promise.resolve({ kind: 'unavailable' })
    case 'pending':
      return new Promise(() => undefined)
    default:
      return Promise.resolve({ kind: 'technical' })
  }
}

createRoot(rootElement).render(
  <StrictMode>
    <LoginPage
      navigation={{
        replace(destination) {
          window.history.replaceState(null, '', destination)
        },
      }}
      onSubmit={
        parameters.get('real') === '1'
          ? authApi.login
          : simulatedLogin
      }
      sessionStore={sessionStore}
    />
  </StrictMode>,
)
