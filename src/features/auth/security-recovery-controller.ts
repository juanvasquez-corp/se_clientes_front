import type { RemoteCacheController } from '../../app/query-client'
import type { AuthApi } from '../../core/session/auth-api'
import type { SessionLock } from '../../core/session/session-lock'
import type { SessionStore } from '../../core/session/session-store'

export type SecurityOperation = 'refresh' | 'logout'

export type SecurityRecoveryResult =
  | { readonly kind: 'restored' }
  | { readonly kind: 'dead' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'unavailable' }

export type OriginalRetryResult =
  | { readonly kind: 'dispatched' }
  | { readonly kind: 'not-ready' }
  | { readonly kind: 'failed' }

export interface SecurityRecoveryController {
  readonly operation: SecurityOperation
  readonly restoreProtection: () => Promise<SecurityRecoveryResult>
  readonly retryOriginal: () => Promise<OriginalRetryResult>
}

export interface SecurityRecoveryControllerConfig {
  readonly authApi: Pick<AuthApi, 'getCsrf'>
  readonly sessionLock: Pick<SessionLock, 'run'>
  readonly sessionStore: SessionStore
  readonly remoteCache: Pick<RemoteCacheController, 'clearForSessionEnd'>
  readonly retryOriginal: (
    operation: SecurityOperation,
    csrfToken: string,
  ) => Promise<void>
  readonly navigate: (
    destination: '/login' | '/forbidden' | '/unavailable',
  ) => void
}

function securityOperation(sessionStore: SessionStore): SecurityOperation {
  const state = sessionStore.getState()
  if (
    state.status === 'blocked' ||
    (state.status === 'unavailable' && state.context === 'security-recovery')
  ) {
    return state.operation
  }
  throw new Error('No hay una operación de seguridad pendiente.')
}

export function createSecurityRecoveryController(
  config: SecurityRecoveryControllerConfig,
): SecurityRecoveryController {
  const operation = securityOperation(config.sessionStore)
  let restoredCsrfToken: string | undefined
  let recoveryAttempt: Promise<SecurityRecoveryResult> | undefined
  let retryAttempt: Promise<OriginalRetryResult> | undefined

  const runRecovery = async (): Promise<SecurityRecoveryResult> => {
    const outcome = await config.sessionLock.run(operation, () =>
      config.authApi.getCsrf(),
    )
    switch (outcome.kind) {
      case 'success':
        restoredCsrfToken = outcome.csrfToken
        config.sessionStore.getState().markSecurityProtectionRestored()
        return { kind: 'restored' }
      case 'unauthorized':
        restoredCsrfToken = undefined
        config.sessionStore.getState().markDead()
        config.remoteCache.clearForSessionEnd()
        config.navigate('/login')
        return { kind: 'dead' }
      case 'forbidden':
        restoredCsrfToken = undefined
        config.sessionStore.getState().markSecurityRecoveryBlocked()
        config.navigate('/forbidden')
        return { kind: 'blocked' }
      case 'unavailable':
      case 'missing-csrf':
      case 'technical':
        restoredCsrfToken = undefined
        config.sessionStore.getState().markSecurityRecoveryUnavailable()
        config.navigate('/unavailable')
        return { kind: 'unavailable' }
    }
  }

  const restoreProtection = (): Promise<SecurityRecoveryResult> => {
    if (recoveryAttempt !== undefined) return recoveryAttempt
    if (restoredCsrfToken !== undefined) {
      return Promise.resolve({ kind: 'restored' })
    }
    const attempt = runRecovery().catch(() => {
      restoredCsrfToken = undefined
      config.sessionStore.getState().markSecurityRecoveryUnavailable()
      config.navigate('/unavailable')
      return { kind: 'unavailable' } as const
    })
    recoveryAttempt = attempt
    void attempt.then(() => {
      if (recoveryAttempt === attempt) recoveryAttempt = undefined
    })
    return attempt
  }

  const retryOriginal = (): Promise<OriginalRetryResult> => {
    if (retryAttempt !== undefined) return retryAttempt
    if (restoredCsrfToken === undefined) {
      return Promise.resolve({ kind: 'not-ready' })
    }
    const csrfToken = restoredCsrfToken
    restoredCsrfToken = undefined
    const attempt = config
      .retryOriginal(operation, csrfToken)
      .then(
        (): OriginalRetryResult => ({ kind: 'dispatched' }),
        (): OriginalRetryResult => ({ kind: 'failed' }),
      )
    retryAttempt = attempt
    void attempt.then(() => {
      if (retryAttempt === attempt) retryAttempt = undefined
    })
    return attempt
  }

  return { operation, restoreProtection, retryOriginal }
}
