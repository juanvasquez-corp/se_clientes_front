import { userResponseSchema, type UserResponse } from '../../contracts/schemas/user'
import type { ApiClient } from '../http/api-client'
import type { AuthClient, LoginCredentials } from '../http/auth-client'
import { ApiError } from '../http/errors'
import {
  type SessionIdentity,
  type SessionStore,
  type SessionTokens,
} from './session-store'

export interface AuthApiConfig {
  readonly authClient: Pick<AuthClient, 'login'>
  readonly apiClient: Pick<ApiClient, 'read'>
  readonly sessionStore: SessionStore
}

export interface AuthApi {
  readonly login: (credentials: LoginCredentials) => Promise<LoginOutcome>
}

export type LoginOutcome =
  | { readonly kind: 'authenticated'; readonly identity: SessionIdentity }
  | { readonly kind: 'credentials-rejected' }
  | { readonly kind: 'rate-limited'; readonly retryAfter: string | null }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'technical' }

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

export function createAuthApi(config: AuthApiConfig): AuthApi {
  return {
    async login(credentials) {
      let response
      try {
        response = await config.authClient.login(credentials)
      } catch (error: unknown) {
        return classifyLoginError(error)
      }
      const tokens: SessionTokens = {
        accessToken: response.access_token,
        tokenType: response.token_type,
        expiresIn: response.expires_in,
        csrfToken: response.csrf_token,
      }
      config.sessionStore.getState().stageTokens(tokens)

      try {
        const profile = await config.apiClient.read({
          target: '/users/me',
          schema: userResponseSchema,
        })
        if (profile.kind !== 'success') {
          config.sessionStore.getState().clearSession()
          return { kind: 'technical' }
        }

        const identity = toSessionIdentity(profile.data)
        config.sessionStore.getState().completeSession(identity)
        return { kind: 'authenticated', identity }
      } catch {
        config.sessionStore.getState().clearSession()
        return { kind: 'technical' }
      }
    },
  }
}
