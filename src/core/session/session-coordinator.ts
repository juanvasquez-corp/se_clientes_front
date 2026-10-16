import { userResponseSchema, type UserResponse } from '../../contracts/schemas/user'
import type { RemoteCacheController } from '../../app/query-client'
import type {
  ApiClient,
  ReadOutcome,
  RecoveryResult,
  SessionRecovery,
} from '../http/api-client'
import { ApiError } from '../http/errors'
import type {
  AuthApi,
  CsrfOutcome,
  RefreshOutcome,
  SessionApiFailure,
} from './auth-api'
import {
  restorationOutcome,
  type RestorationFailure,
  type RestorationStep,
} from './restoration-outcome'
import type { SessionIdentity, SessionStore } from './session-store'
import type { SessionLock } from './session-lock'

export type InitialRestorationResult =
  | 'authenticated'
  | 'dead'
  | 'unavailable'
  | 'forbidden'
  | 'technical'

export interface InitialSessionCoordinator {
  readonly restoreInitial: () => Promise<InitialRestorationResult>
  readonly retryInitial: () => Promise<InitialRestorationResult>
  readonly cancelInitial: () => void
}

export type ReplacementRestorationResult =
  | 'authenticated'
  | 'dead'
  | 'forbidden'
  | 'blocked'
  | 'unavailable'

export type SessionCoordinator = InitialSessionCoordinator &
  SessionRecovery & {
    readonly restoreReplacement: (
      previousIdentity: SessionIdentity,
    ) => Promise<ReplacementRestorationResult>
  }

export interface InitialSessionCoordinatorConfig {
  readonly authApi: Pick<AuthApi, 'getCsrf' | 'refresh'>
  readonly profileApi: Pick<ApiClient, 'read'>
  readonly sessionStore: SessionStore
  readonly remoteCache: Pick<RemoteCacheController, 'clearForSessionEnd'>
  readonly criticalOperations: Pick<SessionLock, 'run'>
  readonly navigate: (
    destination: '/login' | '/forbidden' | '/unavailable',
  ) => void
}

function toSessionIdentity(user: UserResponse): SessionIdentity {
  return {
    userUuid: user.uuid,
    name: user.name,
    lastName: user.last_name,
    email: user.email,
    phoneNumber: user.phone_number,
    role: user.role,
    isActive: user.is_active,
  }
}

function isUnavailableFailure(failure: SessionApiFailure): boolean {
  return failure.kind === 'unavailable'
}

function isUnauthorizedFailure(failure: SessionApiFailure): boolean {
  return failure.kind === 'unauthorized'
}

export function createInitialSessionCoordinator(
  config: InitialSessionCoordinatorConfig,
): SessionCoordinator {
  let initialAttempt: Promise<InitialRestorationResult> | undefined
  let activeAttempt: Promise<InitialRestorationResult> | undefined
  let restorationVersion = 0
  let refreshAttempt: Promise<RecoveryResult> | undefined
  let replacementAttempt: Promise<ReplacementRestorationResult> | undefined

  const endDead = (): 'dead' => {
    config.sessionStore.getState().markDead()
    config.remoteCache.clearForSessionEnd()
    config.navigate('/login')
    return 'dead'
  }

  const endUnavailable = (
    result: 'unavailable' | 'technical',
  ): InitialRestorationResult => {
    config.sessionStore.getState().markRestorationUnavailable()
    config.navigate('/unavailable')
    return result
  }

  const authFailure = (failure: SessionApiFailure): InitialRestorationResult => {
    if (isUnauthorizedFailure(failure)) return endDead()
    if (isUnavailableFailure(failure)) return endUnavailable('unavailable')
    if (failure.kind === 'forbidden') {
      config.sessionStore.getState().markRestorationForbidden()
      config.navigate('/forbidden')
      return 'forbidden'
    }
    return endUnavailable('technical')
  }

  const runRefreshCritical = () =>
    config.criticalOperations.run('refresh', () => config.authApi.refresh())

  const profileFailure = (error: unknown): InitialRestorationResult => {
    if (error instanceof ApiError && error.failure.kind === 'unauthorized') {
      return endDead()
    }
    if (error instanceof ApiError && error.failure.kind === 'unavailable') {
      return endUnavailable('unavailable')
    }
    return endUnavailable('technical')
  }

  const finishProfile = (
    outcome: ReadOutcome<UserResponse>,
  ): InitialRestorationResult => {
    if (outcome.kind === 'session') {
      if (outcome.state === 'dead') return endDead()
      if (outcome.state === 'unavailable') return endUnavailable('unavailable')
      return endUnavailable('technical')
    }

    config.sessionStore.getState().acceptIdentity(toSessionIdentity(outcome.data))
    return 'authenticated'
  }

  const runInitialRestoration = async (
    version: number,
  ): Promise<InitialRestorationResult> => {
    config.sessionStore.getState().beginRestoration()

    const csrf: CsrfOutcome = await config.authApi.getCsrf()
    if (version !== restorationVersion) return 'technical'
    if (csrf.kind !== 'success') return authFailure(csrf)
    config.sessionStore.getState().acceptRestorationCsrf(csrf.csrfToken)

    const refresh: RefreshOutcome = await runRefreshCritical()
    if (version !== restorationVersion) return 'technical'
    if (refresh.kind !== 'success') return authFailure(refresh)
    config.sessionStore.getState().acceptRestorationTokens(refresh.tokens)

    try {
      const profile = await config.profileApi.read({
        target: '/users/me',
        schema: userResponseSchema,
      })
      if (version !== restorationVersion) return 'technical'
      return finishProfile(profile)
    } catch (error: unknown) {
      if (version !== restorationVersion) return 'technical'
      return profileFailure(error)
    }
  }

  const startAttempt = (): Promise<InitialRestorationResult> => {
    restorationVersion += 1
    const attempt = runInitialRestoration(restorationVersion)
    activeAttempt = attempt
    void attempt.then(
      () => {
        if (activeAttempt === attempt) activeAttempt = undefined
      },
      () => {
        if (activeAttempt === attempt) activeAttempt = undefined
      },
    )
    return attempt
  }

  const endRefreshUnavailable = (): RecoveryResult => {
    config.sessionStore.getState().markRefreshUnavailable()
    config.navigate('/unavailable')
    return 'unavailable'
  }

  const runReadRecovery = async (): Promise<RecoveryResult> => {
    if (config.sessionStore.getState().status !== 'authenticated') {
      const status = config.sessionStore.getState().status
      if (status === 'dead') return 'dead'
      if (status === 'blocked') return 'blocked'
      return 'unavailable'
    }

    try {
      const refresh = await runRefreshCritical()
      if (refresh.kind === 'success') {
        config.sessionStore.getState().acceptRefreshedTokens(refresh.tokens)
        return config.sessionStore.getState().status === 'authenticated'
          ? 'recovered'
          : 'dead'
      }
      if (refresh.kind === 'unauthorized') return endDead()
      if (refresh.kind === 'forbidden') {
        config.sessionStore.getState().markRefreshBlocked()
        config.navigate('/forbidden')
        return 'blocked'
      }
      return endRefreshUnavailable()
    } catch {
      return endRefreshUnavailable()
    }
  }

  const recoverRead = (): Promise<RecoveryResult> => {
    if (refreshAttempt !== undefined) return refreshAttempt

    const attempt = runReadRecovery()
    refreshAttempt = attempt
    void attempt.then(
      () => {
        if (refreshAttempt === attempt) refreshAttempt = undefined
      },
      () => {
        if (refreshAttempt === attempt) refreshAttempt = undefined
      },
    )
    return attempt
  }

  const failureFromAuth = (failure: SessionApiFailure): RestorationFailure => {
    switch (failure.kind) {
      case 'unauthorized':
        return 'unauthorized'
      case 'forbidden':
        return 'forbidden'
      case 'unavailable':
        return 'unavailable'
      case 'missing-csrf':
      case 'technical':
        return 'technical'
    }
  }

  const settleReplacementFailure = (
    step: RestorationStep,
    failure: RestorationFailure,
    previousIdentity: SessionIdentity,
  ): ReplacementRestorationResult => {
    const outcome = restorationOutcome(step, failure)
    switch (outcome.kind) {
      case 'continue':
        return 'authenticated'
      case 'dead':
        return endDead()
      case 'forbidden-access':
        config.sessionStore.getState().markRestorationForbidden()
        config.navigate(outcome.destination)
        return 'forbidden'
      case 'blocked-security':
        config.sessionStore
          .getState()
          .markReplacementRefreshBlocked(previousIdentity)
        config.navigate(outcome.destination)
        return 'blocked'
      case 'unavailable':
        config.sessionStore.getState().markRestorationUnavailable()
        config.navigate(outcome.destination)
        return 'unavailable'
    }
  }

  const profileRestorationFailure = (error: unknown): RestorationFailure => {
    if (error instanceof ApiError) {
      if (error.failure.kind === 'unauthorized') return 'unauthorized'
      if (error.failure.kind === 'forbidden') return 'forbidden'
      if (error.failure.kind === 'unavailable') return 'unavailable'
    }
    return 'technical'
  }

  const runReplacementRestoration = async (
    previousIdentity: SessionIdentity,
  ): Promise<ReplacementRestorationResult> => {
    config.sessionStore.getState().beginRestoration()

    const csrf = await config.authApi.getCsrf()
    if (csrf.kind !== 'success') {
      return settleReplacementFailure(
        'csrf',
        failureFromAuth(csrf),
        previousIdentity,
      )
    }
    config.sessionStore.getState().acceptRestorationCsrf(csrf.csrfToken)

    const refresh = await runRefreshCritical()
    if (refresh.kind !== 'success') {
      return settleReplacementFailure(
        'refresh',
        failureFromAuth(refresh),
        previousIdentity,
      )
    }
    config.sessionStore.getState().acceptRestorationTokens(refresh.tokens)

    try {
      const profile = await config.profileApi.read({
        target: '/users/me',
        schema: userResponseSchema,
      })
      if (profile.kind === 'session') {
        const failure: RestorationFailure =
          profile.state === 'dead'
            ? 'unauthorized'
            : profile.state === 'blocked'
              ? 'forbidden'
              : 'unavailable'
        return settleReplacementFailure('profile', failure, previousIdentity)
      }
      config.sessionStore
        .getState()
        .acceptIdentity(toSessionIdentity(profile.data))
      return 'authenticated'
    } catch (error: unknown) {
      return settleReplacementFailure(
        'profile',
        profileRestorationFailure(error),
        previousIdentity,
      )
    }
  }

  const restoreReplacement = (
    previousIdentity: SessionIdentity,
  ): Promise<ReplacementRestorationResult> => {
    if (replacementAttempt !== undefined) return replacementAttempt
    const attempt = runReplacementRestoration(previousIdentity)
    replacementAttempt = attempt
    void attempt.then(
      () => {
        if (replacementAttempt === attempt) replacementAttempt = undefined
      },
      () => {
        if (replacementAttempt === attempt) replacementAttempt = undefined
      },
    )
    return attempt
  }

  return {
    restoreInitial() {
      initialAttempt ??= startAttempt()
      return initialAttempt
    },
    retryInitial() {
      return activeAttempt ?? startAttempt()
    },
    cancelInitial() {
      if (activeAttempt === undefined) return
      restorationVersion += 1
      initialAttempt = undefined
      activeAttempt = undefined
      config.sessionStore.getState().beginRestoration()
    },
    recoverRead,
    restoreReplacement,
  }
}
