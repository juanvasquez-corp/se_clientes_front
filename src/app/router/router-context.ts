import type { QueryClient } from '@tanstack/react-query'

import type { InitialSessionCoordinator } from '../../core/session/session-coordinator'
import type { LoginOutcome } from '../../core/session/auth-api'
import type { SessionStore } from '../../core/session/session-store'
import type { LoginInput } from '../../features/auth/login-schema'
import type { LogoutController } from '../../features/auth/logout-controller'
import type { ProfileApi } from '../../features/profile/profile-api'
import type { SecurityRecoveryController } from '../../features/auth/security-recovery-controller'

export interface RouterSessionContext {
  readonly store: SessionStore
  readonly login: (input: LoginInput) => Promise<LoginOutcome>
  readonly logoutController: LogoutController
  readonly profileApi: ProfileApi
  readonly createSecurityRecoveryController: () => SecurityRecoveryController
  readonly coordinator: Pick<
    InitialSessionCoordinator,
    'restoreInitial' | 'retryInitial' | 'cancelInitial'
  >
}

export interface AppRouterContext {
  readonly queryClient: QueryClient
  readonly session: RouterSessionContext
}
