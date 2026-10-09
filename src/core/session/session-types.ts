import type { UserRole } from '../../contracts/schemas/user'

export interface SessionIdentity {
  readonly userUuid: string
  readonly name: string
  readonly lastName: string | null
  readonly email: string
  readonly phoneNumber: string | null
  readonly role: UserRole
  readonly isActive: boolean
}

export interface SessionTokens {
  readonly accessToken: string
  readonly tokenType: string
  readonly expiresIn: number
  readonly csrfToken: string
}

export interface SessionCredentials extends SessionTokens {
  readonly accessExpiresAt: Date
}

interface EmptySessionContent {
  readonly accessToken: undefined
  readonly tokenType: undefined
  readonly expiresIn: undefined
  readonly accessExpiresAt: undefined
  readonly csrfToken: undefined
  readonly identity: undefined
}

export interface InitialUnknownSessionState extends EmptySessionContent {
  readonly status: 'unknown'
  readonly phase: 'initial'
}

export interface RestoringUnknownSessionState {
  readonly status: 'unknown'
  readonly phase: 'restoring'
  readonly accessToken: undefined
  readonly tokenType: undefined
  readonly expiresIn: undefined
  readonly accessExpiresAt: undefined
  readonly csrfToken: string | undefined
  readonly identity: undefined
}

export interface LoginProfileSessionState extends SessionCredentials {
  readonly status: 'unknown'
  readonly phase: 'login-profile'
  readonly identity: undefined
}

export interface RestoringProfileSessionState extends SessionCredentials {
  readonly status: 'unknown'
  readonly phase: 'restoration-profile'
  readonly identity: undefined
}

export type UnknownSessionState =
  | InitialUnknownSessionState
  | RestoringUnknownSessionState
  | LoginProfileSessionState
  | RestoringProfileSessionState

export interface AuthenticatedSessionState extends SessionCredentials {
  readonly status: 'authenticated'
  readonly identity: SessionIdentity
}

export interface DeadSessionState extends EmptySessionContent {
  readonly status: 'dead'
}

export interface ForbiddenSessionState extends EmptySessionContent {
  readonly status: 'forbidden'
  readonly reason: 'access-denied'
}

export interface BlockedSessionState {
  readonly status: 'blocked'
  readonly operation: 'refresh' | 'logout'
  readonly protection: 'required' | 'restored'
  readonly accessToken: undefined
  readonly tokenType: undefined
  readonly expiresIn: undefined
  readonly accessExpiresAt: undefined
  readonly csrfToken: undefined
  readonly identity: SessionIdentity
}

export interface InitialUnavailableSessionState extends EmptySessionContent {
  readonly status: 'unavailable'
  readonly context: 'initial-restoration'
}

export interface SecurityUnavailableSessionState {
  readonly status: 'unavailable'
  readonly context: 'security-recovery'
  readonly operation: 'refresh' | 'logout'
  readonly accessToken: undefined
  readonly tokenType: undefined
  readonly expiresIn: undefined
  readonly accessExpiresAt: undefined
  readonly csrfToken: undefined
  readonly identity: SessionIdentity
}

export type UnavailableSessionState =
  | InitialUnavailableSessionState
  | SecurityUnavailableSessionState

export type SessionState =
  | UnknownSessionState
  | AuthenticatedSessionState
  | DeadSessionState
  | ForbiddenSessionState
  | BlockedSessionState
  | UnavailableSessionState

export type SessionEvent =
  | { readonly type: 'restoration-started' }
  | { readonly type: 'restoration-csrf-accepted'; readonly csrfToken: string }
  | { readonly type: 'restoration-unavailable' }
  | {
      readonly type: 'restoration-credentials-accepted'
      readonly credentials: SessionCredentials
    }
  | { readonly type: 'restoration-forbidden' }
  | {
      readonly type: 'replacement-refresh-blocked'
      readonly identity: SessionIdentity
    }
  | {
      readonly type: 'refresh-succeeded'
      readonly credentials: SessionCredentials
    }
  | { readonly type: 'refresh-blocked' }
  | { readonly type: 'refresh-unavailable' }
  | { readonly type: 'logout-blocked' }
  | { readonly type: 'security-protection-restored' }
  | { readonly type: 'security-recovery-blocked' }
  | { readonly type: 'security-recovery-unavailable' }
  | {
      readonly type: 'security-refresh-succeeded'
      readonly credentials: SessionCredentials
    }
  | {
      readonly type: 'credentials-accepted'
      readonly credentials: SessionCredentials
    }
  | {
      readonly type: 'identity-validated'
      readonly identity: SessionIdentity
    }
  | { readonly type: 'session-rejected' }

export const initialSessionState: InitialUnknownSessionState = {
  status: 'unknown',
  phase: 'initial',
  accessToken: undefined,
  tokenType: undefined,
  expiresIn: undefined,
  accessExpiresAt: undefined,
  csrfToken: undefined,
  identity: undefined,
}

export const deadSessionState: DeadSessionState = {
  status: 'dead',
  accessToken: undefined,
  tokenType: undefined,
  expiresIn: undefined,
  accessExpiresAt: undefined,
  csrfToken: undefined,
  identity: undefined,
}

export const initialUnavailableSessionState: InitialUnavailableSessionState = {
  status: 'unavailable',
  context: 'initial-restoration',
  accessToken: undefined,
  tokenType: undefined,
  expiresIn: undefined,
  accessExpiresAt: undefined,
  csrfToken: undefined,
  identity: undefined,
}
