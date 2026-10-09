import type { RemoteCacheController } from '../../app/query-client'
import type { AuthApi } from '../../core/session/auth-api'
import type { CrossTabSession } from '../../core/session/cross-tab'
import type { SessionLock } from '../../core/session/session-lock'
import type { SessionStore } from '../../core/session/session-store'

export type LogoutResult =
  | { readonly kind: 'logged-out' }
  | { readonly kind: 'local-session-ended' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'unavailable' }

export interface LogoutController {
  readonly logout: () => Promise<LogoutResult>
}

export interface LogoutControllerConfig {
  readonly authApi: Pick<AuthApi, 'logout'>
  readonly sessionLock: Pick<SessionLock, 'run'>
  readonly sessionStore: SessionStore
  readonly remoteCache: Pick<RemoteCacheController, 'clearForLogout'>
  readonly sessionSignals: Pick<CrossTabSession, 'publish'>
  readonly navigate: (destination: '/login' | '/forbidden') => void
}

export function createLogoutController(
  config: LogoutControllerConfig,
): LogoutController {
  let logoutAttempt: Promise<LogoutResult> | undefined

  const clearLocalSession = () => {
    config.sessionStore.getState().markDead()
    config.remoteCache.clearForLogout()
    config.navigate('/login')
  }

  const executeLogout = async (): Promise<LogoutResult> => {
    try {
      const outcome = await config.sessionLock.run('logout', () =>
        config.authApi.logout(),
      )
      switch (outcome.kind) {
        case 'success':
          config.sessionStore.getState().markDead()
          config.remoteCache.clearForLogout()
          config.sessionSignals.publish('logged-out')
          config.navigate('/login')
          return { kind: 'logged-out' }
        case 'unauthorized':
          clearLocalSession()
          return { kind: 'local-session-ended' }
        case 'forbidden':
          config.sessionStore.getState().markLogoutBlocked()
          config.navigate('/forbidden')
          return { kind: 'blocked' }
        case 'unavailable':
        case 'missing-csrf':
        case 'technical':
          return { kind: 'unavailable' }
      }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  return {
    logout() {
      if (logoutAttempt !== undefined) return logoutAttempt
      const attempt = executeLogout()
      logoutAttempt = attempt
      void attempt.then(
        () => {
          if (logoutAttempt === attempt) logoutAttempt = undefined
        },
        () => {
          if (logoutAttempt === attempt) logoutAttempt = undefined
        },
      )
      return attempt
    },
  }
}
