import { StrictMode, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'

import { SessionBootstrap } from '../../app/session-bootstrap'
import { SessionCoordinationWarning } from '../../app/session-coordination-warning'
import {
  createAppQueryClient,
  createRemoteCacheController,
} from '../../app/query-client'
import { parsePublicEnv } from '../../config/env'
import { userResponseSchema } from '../../contracts/schemas/user'
import { createApiClient } from '../../core/http/api-client'
import { createAuthClient } from '../../core/http/auth-client'
import { createAuthApi } from '../../core/session/auth-api'
import {
  createCrossTabSession,
  type BroadcastChannelFactory,
  type BroadcastChannelPort,
} from '../../core/session/cross-tab'
import { createSessionCoordination } from '../../core/session/session-coordination'
import { createInitialSessionCoordinator } from '../../core/session/session-coordinator'
import type { LockManagerPort } from '../../core/session/session-lock'
import { createSessionStore } from '../../core/session/session-store'
import { LogoutDialog } from '../../features/auth/logout-dialog'
import { createLogoutController } from '../../features/auth/logout-controller'
import { homeForRole } from '../../features/auth/login-navigation'
import { createSecurityRecoveryController } from '../../features/auth/security-recovery-controller'
import { SecurityRecoveryPanel } from '../../features/auth/security-recovery-panel'
import { Card } from '../../shared/ui/card'
import '../../styles/app.css'

interface SanitizedFixtureState {
  cacheEntries: number
  hasUsableAccess: boolean
  hasUsableCsrf: boolean
  mode: 'coordinated' | 'limited'
  path: string
  status: string
}

declare global {
  interface Window {
    __sessionFixture?: {
      close: () => void
      messages: () => readonly string[]
      runConcurrentReads: () => Promise<readonly string[]>
      runMutation: () => Promise<string>
      state: () => SanitizedFixtureState
    }
  }
}

const rootElement = document.getElementById('fixture-root')
if (!rootElement) throw new Error('No se encontró el elemento raíz del fixture de sesión.')

const parameters = new URLSearchParams(window.location.search)
const limited = parameters.get('limited') === '1'
const seeded = parameters.get('seeded') === '1'
const blockedOperation = parameters.get('blocked')
const apiBaseUrl = parsePublicEnv(import.meta.env).apiBaseUrl
const sessionStore = createSessionStore()
const queryClient = createAppQueryClient()
const remoteCache = createRemoteCacheController(queryClient)
const sentMessages: string[] = []

const lockManager: LockManagerPort | undefined =
  !limited
    ? {
        async request<T>(
          name: string,
          options: { readonly mode: 'exclusive'; readonly signal?: AbortSignal },
          callback: () => Promise<T> | T,
        ): Promise<T> {
          return navigator.locks.request(name, options, async () => callback())
        },
      }
    : undefined

const channelFactory: BroadcastChannelFactory | undefined =
  !limited && typeof BroadcastChannel === 'function'
    ? (name) => {
        const channel = new BroadcastChannel(name)
        const port: BroadcastChannelPort = {
          postMessage(message) {
            if (
              typeof message === 'object' &&
              message !== null &&
              'type' in message &&
              typeof message.type === 'string'
            ) {
              sentMessages.push(message.type)
            }
            channel.postMessage(message)
          },
          addEventListener(type, listener) {
            channel.addEventListener(type, listener)
          },
          removeEventListener(type, listener) {
            channel.removeEventListener(type, listener)
          },
          close() {
            channel.close()
          },
        }
        return port
      }
    : undefined

const coordination = createSessionCoordination({ lockManager, channelFactory })
const authClient = createAuthClient({
  apiBaseUrl,
  getCsrfToken: () => sessionStore.getState().getCsrfToken(),
})
const crossTabRef: {
  current: ReturnType<typeof createCrossTabSession> | undefined
} = { current: undefined }
const sessionSignals = {
  publish(signal: 'session-replaced') {
    crossTabRef.current?.publish(signal)
  },
}
const profileApiClient = createApiClient({
  apiBaseUrl,
  getAccessToken: () => sessionStore.getState().getAccessToken(),
  sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
})
const authApi = createAuthApi({
  authClient,
  apiClient: profileApiClient,
  sessionStore,
  criticalOperations: { run: coordination.runCritical },
  sessionSignals,
})
const navigate = (
  destination: '/login' | '/profile' | '/users' | '/forbidden' | '/unavailable',
) => {
  window.history.replaceState(null, '', destination)
}
const coordinator = createInitialSessionCoordinator({
  authApi,
  profileApi: profileApiClient,
  sessionStore,
  remoteCache,
  navigate,
  criticalOperations: { run: coordination.runCritical },
})
const apiClient = createApiClient({
  apiBaseUrl,
  getAccessToken: () => sessionStore.getState().getAccessToken(),
  sessionRecovery: coordinator,
})

if (seeded) {
  sessionStore.getState().acceptTokens({
    accessToken: 'fixture-access',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'fixture-csrf',
  })
  sessionStore.getState().acceptIdentity({
    userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
    name: 'Fixture',
    lastName: null,
    email: 'fixture@example.test',
    phoneNumber: null,
    role: 'superadmin',
    isActive: true,
  })
  queryClient.setQueryData(['fixture', 'private'], { ready: true })
  if (blockedOperation === 'refresh') sessionStore.getState().markRefreshBlocked()
  if (blockedOperation === 'logout') sessionStore.getState().markLogoutBlocked()
}

crossTabRef.current =
  coordination.channelFactory === undefined
    ? undefined
    : createCrossTabSession({
        channelFactory: coordination.channelFactory,
        sessionStore,
        remoteCache,
        coordinator,
        navigation: {
          currentPath: () => window.location.pathname,
          replace: navigate,
        },
        initialDestination: homeForRole,
      })
const crossTab = crossTabRef.current

const logoutController = createLogoutController({
  authApi,
  sessionLock: { run: coordination.runCritical },
  sessionStore,
  remoteCache,
  sessionSignals: crossTab ?? { publish: () => undefined },
  navigate,
})

export function PrivateContent() {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title level={2}>Contenido privado</Card.Title>
        <Card.Description>La identidad validada habilitó esta sección.</Card.Description>
      </Card.Header>
      <Card.Actions>
        <LogoutDialog controller={logoutController} />
      </Card.Actions>
    </Card.Root>
  )
}

export function SecurityContent() {
  const [controller] = useState(() =>
    createSecurityRecoveryController({
      authApi,
      sessionLock: { run: coordination.runCritical },
      sessionStore,
      remoteCache,
      retryOriginal: () => Promise.resolve(),
      navigate,
    }),
  )
  return <SecurityRecoveryPanel controller={controller} />
}

export function FixtureApp() {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getState,
    sessionStore.getInitialState,
  )
  const privateContent = <PrivateContent />
  const securityState =
    session.status === 'blocked' ||
    (session.status === 'unavailable' && session.context === 'security-recovery')

  return (
    <main className="min-h-screen bg-surface-page p-6 text-text-primary">
      <section className="mx-auto grid max-w-3xl gap-6">
        <h1 className="text-2xl font-semibold text-brand-heading">
          Ciclo de vida de sesión
        </h1>
        <SessionCoordinationWarning mode={coordination.mode} />
        {securityState ? <SecurityContent /> : null}
        {seeded ? (
          session.status === 'authenticated' ? privateContent : null
        ) : (
          <SessionBootstrap coordinator={coordinator} sessionStore={sessionStore}>
            {privateContent}
          </SessionBootstrap>
        )}
      </section>
    </main>
  )
}

window.__sessionFixture = {
  close() {
    crossTab?.close()
  },
  messages: () => [...sentMessages],
  async runConcurrentReads() {
    const outcomes = await Promise.all([
      apiClient.read({ target: '/users/me', schema: userResponseSchema }),
      apiClient.read({ target: '/users/me', schema: userResponseSchema }),
    ])
    return outcomes.map(({ kind }) => kind)
  },
  async runMutation() {
    const outcome = await apiClient.mutate({
      method: 'POST',
      target: '/users/search',
      source: { email: 'fixture@example.test' },
      allowedKeys: ['email'],
      schema: userResponseSchema,
    })
    return outcome.kind
  },
  state() {
    const state = sessionStore.getState()
    return {
      cacheEntries: queryClient.getQueryCache().getAll().length,
      hasUsableAccess: typeof state.getAccessToken() === 'string',
      hasUsableCsrf: typeof state.getCsrfToken() === 'string',
      mode: coordination.mode,
      path: window.location.pathname,
      status: state.status,
    }
  },
}

createRoot(rootElement).render(
  <StrictMode>
    <FixtureApp />
  </StrictMode>,
)
