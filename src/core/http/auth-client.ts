import axios, { AxiosHeaders, type AxiosInstance, type Method } from 'axios'
import type { z } from 'zod'

import {
  csrfResponseSchema,
  messageResponseSchema,
  tokenResponseSchema,
  type CsrfResponse,
  type MessageResponse,
  type TokenResponse,
} from '../../contracts/schemas/auth'
import { ApiError, classifyApiFailure } from './errors'
import { parseJsonResponse } from './parse-response'
import { buildJsonBody, isKnownApiTarget } from './request-policy'

const DEFAULT_AUTH_ENDPOINTS: AuthEndpoints = {
  csrf: '/auth/csrf',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
}

const AUTH_PATHS: Record<AuthOperation, string> = {
  csrf: '/api/auth/csrf',
  login: '/api/auth/login',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
}

const MAX_RETRY_AFTER_LENGTH = 128

type AuthOperation = keyof AuthEndpoints
export type AuthRequestFailureReason = 'missing-csrf' | 'unsafe-target'

export interface AuthEndpoints {
  csrf: string
  login: string
  refresh: string
  logout: string
}

export interface AuthClientConfig {
  apiBaseUrl: string
  getCsrfToken: () => string | null | undefined
  endpoints?: AuthEndpoints
}

export interface LoginCredentials {
  email: string
  psswd: string
}

export interface AuthClient {
  getCsrf: () => Promise<CsrfResponse>
  login: (credentials: LoginCredentials) => Promise<TokenResponse>
  refresh: () => Promise<TokenResponse>
  logout: () => Promise<MessageResponse>
}

export class AuthRequestError extends Error {
  readonly reason: AuthRequestFailureReason

  constructor(reason: AuthRequestFailureReason) {
    super('No fue posible preparar la solicitud de autenticación.')
    this.name = 'AuthRequestError'
    this.reason = reason
  }
}

function createAxiosInstance(apiBaseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: apiBaseUrl,
    responseType: 'text',
    timeout: 15_000,
    transformResponse: [(data: unknown) => data],
  })
}

function targetPath(target: string): string | undefined {
  try {
    return new URL(target, 'https://relative-auth-target.invalid').pathname
  } catch {
    return undefined
  }
}

function assertAuthTarget(
  apiBaseUrl: string,
  target: string,
  operation: AuthOperation,
): void {
  const path = targetPath(target)
  const expectedPath = AUTH_PATHS[operation]

  if (
    !isKnownApiTarget(apiBaseUrl, target) ||
    (path !== expectedPath && path !== expectedPath.slice('/api'.length))
  ) {
    throw new AuthRequestError('unsafe-target')
  }
}

async function requestValidated<T>(
  client: AxiosInstance,
  method: Method,
  target: string,
  schema: z.ZodType<T>,
  csrfToken?: string,
  data?: Readonly<Record<string, string>>,
): Promise<T> {
  try {
    const response = await client.request<string>({
      method,
      url: target,
      data,
      withCredentials: true,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken === undefined ? {} : { 'X-CSRF-Token': csrfToken }),
      },
    })
    const result = parseJsonResponse(response.data, schema)

    if (!result.success) throw result.error
    return result.data
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const failure = classifyApiFailure(
        error.response?.status,
        parseFailureBody(error.response?.data),
      )
      const retryAfter = readRetryAfter(error.response?.headers)
      throw new ApiError(
        failure,
        failure.kind === 'rate-limited' && typeof retryAfter === 'string'
          ? retryAfter
          : null,
      )
    }
    throw error
  }
}

function readRetryAfter(headers: unknown): string | null {
  if (!(headers instanceof AxiosHeaders)) return null

  const value = headers.get('retry-after')
  return typeof value === 'string' && value.length <= MAX_RETRY_AFTER_LENGTH
    ? value
    : null
}

function parseFailureBody(data: unknown): unknown {
  if (typeof data !== 'string') return undefined

  try {
    const parsed: unknown = JSON.parse(data)
    return parsed
  } catch {
    return undefined
  }
}

export function createAuthClient(config: AuthClientConfig): AuthClient {
  const endpoints = { ...DEFAULT_AUTH_ENDPOINTS, ...config.endpoints }
  const client = createAxiosInstance(config.apiBaseUrl)

  return {
    async getCsrf() {
      assertAuthTarget(config.apiBaseUrl, endpoints.csrf, 'csrf')
      return requestValidated(client, 'GET', endpoints.csrf, csrfResponseSchema)
    },
    async login(credentials) {
      assertAuthTarget(config.apiBaseUrl, endpoints.login, 'login')
      const body = buildJsonBody({ ...credentials }, ['email', 'psswd'] as const)
      return requestValidated(client, 'POST', endpoints.login, tokenResponseSchema, undefined, body)
    },
    async refresh() {
      assertAuthTarget(config.apiBaseUrl, endpoints.refresh, 'refresh')
      const csrfToken = config.getCsrfToken()
      if (csrfToken == null || csrfToken.length === 0) {
        throw new AuthRequestError('missing-csrf')
      }
      return requestValidated(
        client,
        'POST',
        endpoints.refresh,
        tokenResponseSchema,
        csrfToken,
      )
    },
    async logout() {
      assertAuthTarget(config.apiBaseUrl, endpoints.logout, 'logout')
      const csrfToken = config.getCsrfToken()
      if (csrfToken == null || csrfToken.length === 0) {
        throw new AuthRequestError('missing-csrf')
      }
      return requestValidated(
        client,
        'POST',
        endpoints.logout,
        messageResponseSchema,
        csrfToken,
      )
    },
  }
}
