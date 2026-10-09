import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createAppRouter } from '../../app/router/router'
import type { AppRouterContext } from '../../app/router/router-context'
import { userRoleSchema } from '../../contracts/schemas/user'
import { createSessionStore } from '../../core/session/session-store'
import '../../styles/app.css'

const rootElement = document.getElementById('fixture-root')
if (rootElement === null) {
  throw new Error('No se encontró el elemento raíz del fixture de navegación.')
}

const parameters = new URLSearchParams(window.location.search)
const requestedRole = userRoleSchema.safeParse(parameters.get('role'))
const role = requestedRole.success ? requestedRole.data : 'superadmin'
const stateScenario = parameters.get('state')
const sessionStore = createSessionStore()
const authenticate = () => {
  sessionStore.getState().stageTokens({
    accessToken: 'fixture-access',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'fixture-csrf',
  })
  sessionStore.getState().completeSession({
    userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
    name: 'Ana',
    lastName: 'Torres',
    email: 'fixture@example.test',
    phoneNumber: null,
    role,
    isActive: true,
  })
}

switch (stateScenario) {
  case 'forbidden':
    sessionStore.getState().markRestorationForbidden()
    break
  case 'unavailable':
    sessionStore.getState().markRestorationUnavailable()
    break
  case 'blocked':
    authenticate()
    sessionStore.getState().markRefreshBlocked()
    break
  case 'security-unavailable':
    authenticate()
    sessionStore.getState().markRefreshUnavailable()
    break
  default:
    authenticate()
}

const context: AppRouterContext = {
  queryClient: new QueryClient(),
  session: {
    store: sessionStore,
    login: () => Promise.resolve({ kind: 'technical' }),
    logoutController: {
      logout: () => Promise.resolve({ kind: 'unavailable' }),
    },
    createSecurityRecoveryController: () => ({
      operation: 'refresh',
      restoreProtection: () => Promise.resolve({ kind: 'restored' }),
      retryOriginal: () => Promise.resolve({ kind: 'dispatched' }),
    }),
    coordinator: {
      restoreInitial: () => Promise.resolve('authenticated'),
      retryInitial: () => Promise.resolve('authenticated'),
      cancelInitial: () => undefined,
    },
  },
}
const initialPath =
  stateScenario === 'forbidden' || stateScenario === 'blocked'
    ? '/forbidden'
    : stateScenario === 'unavailable' || stateScenario === 'security-unavailable'
      ? '/unavailable'
      : role === 'superadmin'
        ? '/users/new'
        : '/profile'
const router = createAppRouter({
  context,
  history: createMemoryHistory({ initialEntries: [initialPath] }),
})

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
