import { userResponseSchema, type UserResponse } from '../../contracts/schemas/user'
import type { ApiClient } from '../http/api-client'
import {
  AuthRequestError,
  type AuthClient,
  type LoginCredentials,
} from '../http/auth-client'
import { ApiError } from '../http/errors'
import type { SessionLock } from './session-lock'
import {
  type SessionIdentity,
  type SessionStore,
  type SessionTokens,
} from './session-store'

export interface AuthApiConfig {
  readonly authClient: AuthClient
  readonly apiClient: Pick<ApiClient, 'read'>
  readonly sessionStore: SessionStore
  readonly criticalOperations: Pick<SessionLock, 'run'>
  readonly sessionSignals: {
    readonly publish: (signal: 'session-replaced') => void
  }
}

export interface AuthApi {
  readonly login: (credentials: LoginCredentials) => Promise<LoginOutcome>
  readonly getCsrf: () => Promise<CsrfOutcome>
  readonly refresh: () => Promise<RefreshOutcome>
  readonly logout: () => Promise<LogoutOutcome>
}

export type LoginOutcome =
  | { readonly kind: 'authenticated'; readonly identity: SessionIdentity }
  | { readonly kind: 'credentials-rejected' }
  | { readonly kind: 'rate-limited'; readonly retryAfter: string | null }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'technical' }

export type SessionApiFailure =
  | { readonly kind: 'unauthorized'; readonly status: 401 }
  | { readonly kind: 'forbidden'; readonly status: 403 }
  | {
      readonly kind: 'unavailable'
      readonly status: 503 | undefined
    }
  | { readonly kind: 'missing-csrf'; readonly status: undefined }
  | {
      readonly kind: 'technical'
      readonly status: number | undefined
    }

export type CsrfOutcome =
  | { readonly kind: 'success'; readonly csrfToken: string }
  | SessionApiFailure

export type RefreshOutcome =
  | { readonly kind: 'success'; readonly tokens: SessionTokens }
  | SessionApiFailure

export type LogoutOutcome = { readonly kind: 'success' } | SessionApiFailure

function toSessionIdentity(user: UserResponse): SessionIdentity {
  return {
    userUuid: user.uuid,
    name: user.name,
    lastName: user.last_name,
    email: user.email,
    phoneNumber: user.phone_number,
    role: user.rol,
    isActive: user.is_active,
  }
}

function classifyLoginError(error: unknown): Exclude<LoginOutcome, { kind: 'authenticated' }> {
  if (error instanceof ApiError) {
    if (error.failure.kind === 'unauthorized') return { kind: 'credentials-rejected' }
    if (error.failure.kind === 'rate-limited') {
      return { kind: 'rate-limited', retryAfter: error.retryAfter ?? null }
    }
    if (error.failure.kind === 'unavailable') return { kind: 'unavailable' }
  }

  return { kind: 'technical' }
}

function classifySessionError(error: unknown): SessionApiFailure {
  if (error instanceof AuthRequestError && error.reason === 'missing-csrf') {
    return { kind: 'missing-csrf', status: undefined }
  }

  if (error instanceof ApiError) {
    if (error.failure.kind === 'unauthorized') {
      return { kind: 'unauthorized', status: 401 }
    }
    if (error.failure.kind === 'forbidden') {
      return { kind: 'forbidden', status: 403 }
    }
    if (error.failure.kind === 'unavailable') {
      return {
        kind: 'unavailable',
        status: error.failure.status === 503 ? 503 : undefined,
      }
    }
    return { kind: 'technical', status: error.failure.status }
  }

  return { kind: 'technical', status: undefined }
}

function toSessionTokens(response: {
  readonly access_token: string
  readonly token_type: string
  readonly expires_in: number
  readonly csrf_token: string
}): SessionTokens {
  return {
    accessToken: response.access_token,
    tokenType: response.token_type,
    expiresIn: response.expires_in,
    csrfToken: response.csrf_token,
  }
}

export function createAuthApi(config: AuthApiConfig): AuthApi {
  const performLogin = async (
    credentials: LoginCredentials,
  ): Promise<LoginOutcome> => {
    let response
    try {
      response = await config.authClient.login(credentials)
    } catch (error: unknown) {
      return classifyLoginError(error)
    }
    const tokens = toSessionTokens(response)
    config.sessionStore.getState().acceptTokens(tokens)

    try {
      const profile = await config.apiClient.read({
        target: '/users/me',
        schema: userResponseSchema,
      })
      if (profile.kind !== 'success') {
        config.sessionStore.getState().markDead()
        return { kind: 'technical' }
      }

      const identity = toSessionIdentity(profile.data)
      config.sessionStore.getState().acceptIdentity(identity)
      config.sessionSignals.publish('session-replaced')
      return { kind: 'authenticated', identity }
    } catch {
      config.sessionStore.getState().markDead()
      return { kind: 'technical' }
    }
  }

  return {
    async login(credentials) {
      try {
        return await config.criticalOperations.run('login', () =>
          performLogin(credentials),
        )
      } catch {
        return { kind: 'technical' }
      }
    },
    async getCsrf() {
      try {
        const response = await config.authClient.getCsrf()
        return { kind: 'success', csrfToken: response.csrf_token }
      } catch (error: unknown) {
        return classifySessionError(error)
      }
    },
    async refresh() {
      try {
        const response = await config.authClient.refresh()
        return { kind: 'success', tokens: toSessionTokens(response) }
      } catch (error: unknown) {
        return classifySessionError(error)
      }
    },
    async logout() {
      try {
        await config.authClient.logout()
        return { kind: 'success' }
      } catch (error: unknown) {
        return classifySessionError(error)
      }
    },
  }
}
