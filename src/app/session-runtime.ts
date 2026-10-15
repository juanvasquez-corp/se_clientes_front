import type { QueryClient } from '@tanstack/react-query'

import { createApiClient, type RecoveryResult } from '../core/http/api-client'
import { createAuthClient } from '../core/http/auth-client'
import { createAuthApi, type LoginOutcome } from '../core/session/auth-api'
import {
  createCrossTabSession,
  type BroadcastChannelFactory,
  type CrossTabSession,
} from '../core/session/cross-tab'
import {
  createSessionCoordination,
  type SessionCoordinationMode,
} from '../core/session/session-coordination'
import {
  createInitialSessionCoordinator,
  type InitialSessionCoordinator,
} from '../core/session/session-coordinator'
import type { LockManagerPort } from '../core/session/session-lock'
import { createSessionStore, type SessionStore } from '../core/session/session-store'
import { createLogoutController, type LogoutController } from '../features/auth/logout-controller'
import { homeForRole } from '../features/auth/login-navigation'
import {
  createSecurityRecoveryController,
  type SecurityRecoveryController,
} from '../features/auth/security-recovery-controller'
import type { LoginInput } from '../features/auth/login-schema'
import { createProfileApi, type ProfileApi } from '../features/profile/profile-api'
import { profileQueryKey } from '../features/profile/profile-query'
import { createUsersApi, type UsersApi } from '../features/users/users-api'
import { createRemoteCacheController } from './query-client'

export type SessionPath =
  | '/'
  | '/login'
  | '/profile'
  | '/users'
  | '/forbidden'
  | '/unavailable'

export interface SessionNavigation {
  readonly currentPath: () => string
  readonly replace: (destination: SessionPath) => void
  readonly subscribe: (listener: () => void) => () => void
}

export interface AppRuntime {
  readonly sessionStore: SessionStore
  readonly coordinator: InitialSessionCoordinator
  readonly coordinationMode: SessionCoordinationMode
  readonly login: (input: LoginInput) => Promise<LoginOutcome>
  readonly logoutController: LogoutController
  readonly profileApi: ProfileApi
  readonly usersApi: UsersApi
  readonly createSecurityRecoveryController: () => SecurityRecoveryController
  readonly navigation: SessionNavigation
  readonly close: () => void
}

export interface BrowserSessionRuntimeConfig {
  readonly apiBaseUrl: string
  readonly queryClient: QueryClient
  readonly browserWindow: Window
}

function createBrowserNavigation(browserWindow: Window): SessionNavigation {
  return {
    currentPath: () => browserWindow.location.pathname,
    replace(destination) {
      browserWindow.history.replaceState(null, '', destination)
      browserWindow.dispatchEvent(new PopStateEvent('popstate'))
    },
    subscribe(listener) {
      browserWindow.addEventListener('popstate', listener)
      return () => {
        browserWindow.removeEventListener('popstate', listener)
      }
    },
  }
}

function browserLockManager(browserWindow: Window): LockManagerPort | undefined {
  const locksCapability = Reflect.get(browserWindow.navigator, 'locks') as unknown
  if (typeof locksCapability !== 'object' || locksCapability === null) return undefined
  return {
    async request<T>(
      name: string,
      options: { readonly mode: 'exclusive'; readonly signal?: AbortSignal },
      callback: () => Promise<T> | T,
    ): Promise<T> {
      return browserWindow.navigator.locks.request(name, options, async () => callback())
    },
  }
}

function browserChannelFactory(browserWindow: Window): BroadcastChannelFactory | undefined {
  const channelCapability = Reflect.get(browserWindow, 'BroadcastChannel') as unknown
  if (typeof channelCapability !== 'function') return undefined
  return (name) => new BroadcastChannel(name)
}

export function createBrowserSessionRuntime(
  config: BrowserSessionRuntimeConfig,
): AppRuntime {
  const sessionStore = createSessionStore()
  const unsubscribeProfileSeed = sessionStore.subscribe((state, previousState) => {
    if (
      state.status !== 'authenticated' ||
      (previousState.status === 'authenticated' &&
        previousState.identity === state.identity)
    ) {
      return
    }
    const queryKey = profileQueryKey(state.identity.userUuid)
    if (config.queryClient.getQueryData(queryKey) !== undefined) return

    config.queryClient.setQueryData(queryKey, {
      kind: 'success',
      data: {
        uuid: state.identity.userUuid,
        name: state.identity.name,
        last_name: state.identity.lastName,
        email: state.identity.email,
        phone_number: state.identity.phoneNumber,
        rol: state.identity.role,
        is_active: state.identity.isActive,
      },
    })
  })
  const remoteCache = createRemoteCacheController(config.queryClient)
  const navigation = createBrowserNavigation(config.browserWindow)
  const coordination = createSessionCoordination({
    lockManager: browserLockManager(config.browserWindow),
    channelFactory: browserChannelFactory(config.browserWindow),
  })
  let explicitCsrfToken: string | undefined
  let crossTab: CrossTabSession | undefined
  const sessionSignals = {
    publish(signal: 'session-replaced' | 'logged-out') {
      crossTab?.publish(signal)
    },
  }
  const authClient = createAuthClient({
    apiBaseUrl: config.apiBaseUrl,
    getCsrfToken: () =>
      explicitCsrfToken ?? sessionStore.getState().getCsrfToken(),
  })
  let recoverProtectedRequest: () => Promise<RecoveryResult> = () =>
    Promise.resolve('dead')
  const apiClient = createApiClient({
    apiBaseUrl: config.apiBaseUrl,
    getAccessToken: () => sessionStore.getState().getAccessToken(),
    sessionRecovery: { recoverRead: () => recoverProtectedRequest() },
  })
  const authApi = createAuthApi({
    authClient,
    apiClient,
    sessionStore,
    criticalOperations: { run: coordination.runCritical },
    sessionSignals,
  })
  const coordinator = createInitialSessionCoordinator({
    authApi,
    profileApi: apiClient,
    sessionStore,
    remoteCache,
    criticalOperations: { run: coordination.runCritical },
    navigate: navigation.replace,
  })
  recoverProtectedRequest = coordinator.recoverRead
  const profileApi = createProfileApi({ apiClient })
  const usersApi = createUsersApi({ apiClient })
  if (coordination.channelFactory !== undefined) {
    crossTab = createCrossTabSession({
      channelFactory: coordination.channelFactory,
      sessionStore,
      remoteCache,
      coordinator,
      navigation,
      initialDestination: homeForRole,
    })
  }
  const logoutController = createLogoutController({
    authApi,
    sessionLock: { run: coordination.runCritical },
    sessionStore,
    remoteCache,
    sessionSignals: crossTab ?? { publish: () => undefined },
    navigate: navigation.replace,
  })

  return {
    sessionStore,
    coordinator,
    coordinationMode: coordination.mode,
    login: authApi.login,
    logoutController,
    profileApi,
    usersApi,
    createSecurityRecoveryController() {
      return createSecurityRecoveryController({
        authApi,
        sessionLock: { run: coordination.runCritical },
        sessionStore,
        remoteCache,
        async retryOriginal(operation, csrfToken) {
          explicitCsrfToken = csrfToken
          try {
            if (operation === 'refresh') {
              const outcome = await coordination.runCritical('refresh', () =>
                authApi.refresh(),
              )
              if (outcome.kind !== 'success') throw new Error('Refresh no recuperado.')
              sessionStore.getState().acceptSecurityRefreshedTokens(outcome.tokens)
              const identity = sessionStore.getState().identity
              if (identity !== undefined) navigation.replace(homeForRole(identity.role))
              return
            }

            const outcome = await coordination.runCritical('logout', () =>
              authApi.logout(),
            )
            if (outcome.kind !== 'success' && outcome.kind !== 'unauthorized') {
              throw new Error('Logout no recuperado.')
            }
            sessionStore.getState().markDead()
            remoteCache.clearForLogout()
            if (outcome.kind === 'success') crossTab?.publish('logged-out')
            navigation.replace('/login')
          } finally {
            explicitCsrfToken = undefined
          }
        },
        navigate: navigation.replace,
      })
    },
    navigation,
    close() {
      unsubscribeProfileSeed()
      crossTab?.close()
    },
  }
}
