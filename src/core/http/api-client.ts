import axios, { type AxiosInstance } from 'axios'
import type { z } from 'zod'

import { ApiError, classifyApiFailure } from './errors'
import { parseJsonResponse } from './parse-response'
import { buildJsonBody, isKnownApiTarget, shouldRetryRead } from './request-policy'

const USER_UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

type UserMutationMethod = 'POST' | 'PUT' | 'PATCH'
type UserRequestMethod = 'GET' | UserMutationMethod | 'DELETE'

export type ApiRequestFailureReason = 'cancelled' | 'missing-token' | 'unsafe-target'
export type RecoveryResult = 'recovered' | 'dead' | 'blocked' | 'unavailable'
export type SessionFailureState = Exclude<RecoveryResult, 'recovered'>

export interface SessionRecovery {
  recoverRead: () => Promise<RecoveryResult>
}

export interface SuccessOutcome<T> {
  kind: 'success'
  data: T
}

export interface SessionOutcome {
  kind: 'session'
  state: SessionFailureState
}

export interface ConfirmationOutcome {
  kind: 'requires-confirmation'
  sensitiveInput: 'clear'
}

export type ReadOutcome<T> = SuccessOutcome<T> | SessionOutcome
export type MutationOutcome<T> = SuccessOutcome<T> | SessionOutcome | ConfirmationOutcome

export interface ApiClientConfig {
  apiBaseUrl: string
  getAccessToken: () => string | null | undefined
  sessionRecovery: SessionRecovery
}

export interface ReadRequest<T> {
  target: string
  schema: z.ZodType<T>
  signal?: AbortSignal
}

export interface MutationRequest<T, Key extends string, Value> extends ReadRequest<T> {
  method: UserMutationMethod
  source: Readonly<Record<string, Value | undefined>>
  allowedKeys: readonly Key[]
}

export interface ApiClient {
  read: <T>(request: ReadRequest<T>) => Promise<ReadOutcome<T>>
  mutate: <T, const Key extends string, Value>(
    request: MutationRequest<T, Key, Value>,
  ) => Promise<MutationOutcome<T>>
  remove: <T>(request: ReadRequest<T>) => Promise<MutationOutcome<T>>
}

export class ApiRequestError extends Error {
  readonly reason: ApiRequestFailureReason

  constructor(reason: ApiRequestFailureReason) {
    super('No fue posible preparar la solicitud de usuarios.')
    this.name = 'ApiRequestError'
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

function canonicalUserPath(target: string): string | undefined {
  try {
    const path = new URL(target, 'https://relative-user-target.invalid').pathname
    return path === '/users' || path.startsWith('/users/') ? `/api${path}` : path
  } catch {
    return undefined
  }
}

function isUuidPath(path: string): boolean {
  const segments = path.split('/')
  return (
    segments.length === 4 &&
    segments[1] === 'api' &&
    segments[2] === 'users' &&
    segments[3] !== undefined &&
    USER_UUID_SEGMENT.test(segments[3])
  )
}

function isStatusPath(path: string): boolean {
  const segments = path.split('/')
  return (
    segments.length === 5 &&
    segments[1] === 'api' &&
    segments[2] === 'users' &&
    segments[3] !== undefined &&
    USER_UUID_SEGMENT.test(segments[3]) &&
    segments[4] === 'status'
  )
}

function isKnownUserOperation(path: string, method: UserRequestMethod): boolean {
  switch (method) {
    case 'GET':
      return path === '/api/users' || path === '/api/users/me' || isUuidPath(path)
    case 'POST':
      return path === '/api/users/create' || path === '/api/users/search'
    case 'PUT':
      return path === '/api/users/me' || isUuidPath(path)
    case 'PATCH':
      return isStatusPath(path)
    case 'DELETE':
      return isUuidPath(path)
  }
}

function assertUserTarget(
  apiBaseUrl: string,
  target: string,
  method: UserRequestMethod,
): void {
  const path = canonicalUserPath(target)
  if (
    path === undefined ||
    !isKnownApiTarget(apiBaseUrl, target) ||
    !isKnownUserOperation(path, method)
  ) {
    throw new ApiRequestError('unsafe-target')
  }
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

async function requestValidated<T>(
  client: AxiosInstance,
  method: UserRequestMethod,
  target: string,
  token: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  data?: unknown,
): Promise<T> {
  try {
    const response = await client.request<string>({
      method,
      url: target,
      data,
      signal,
      withCredentials: false,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
    })
    const result = parseJsonResponse(response.data, schema)

    if (!result.success) throw result.error
    return result.data
  } catch (error: unknown) {
    if (axios.isCancel(error)) {
      throw new ApiRequestError('cancelled')
    }
    if (axios.isAxiosError(error)) {
      throw new ApiError(
        classifyApiFailure(error.response?.status, parseFailureBody(error.response?.data)),
      )
    }
    throw error
  }
}

function requireAccessToken(
  getAccessToken: () => string | null | undefined,
): string {
  const token = getAccessToken()
  if (token == null || token.length === 0) {
    throw new ApiRequestError('missing-token')
  }
  return token
}

function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.failure.kind === 'unauthorized'
}

async function recoverSession(sessionRecovery: SessionRecovery): Promise<RecoveryResult> {
  try {
    return await sessionRecovery.recoverRead()
  } catch {
    return 'unavailable'
  }
}

function sessionOutcome(state: SessionFailureState): SessionOutcome {
  return { kind: 'session', state }
}

function confirmationOutcome(): ConfirmationOutcome {
  return { kind: 'requires-confirmation', sensitiveInput: 'clear' }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const client = createAxiosInstance(config.apiBaseUrl)

  return {
    async read({ target, schema, signal }) {
      assertUserTarget(config.apiBaseUrl, target, 'GET')
      const executeRead = async () => {
        const token = requireAccessToken(config.getAccessToken)
        return requestValidated(client, 'GET', target, token, schema, signal)
      }

      try {
        return { kind: 'success', data: await executeRead() }
      } catch (error: unknown) {
        if (!isUnauthorized(error) || !shouldRetryRead(0, error.failure)) throw error

        const recovery = await recoverSession(config.sessionRecovery)
        if (recovery !== 'recovered') return sessionOutcome(recovery)

        try {
          return { kind: 'success', data: await executeRead() }
        } catch (repeatedError: unknown) {
          if (isUnauthorized(repeatedError)) return sessionOutcome('dead')
          throw repeatedError
        }
      }
    },
    async mutate({ method, target, source, allowedKeys, schema, signal }) {
      assertUserTarget(config.apiBaseUrl, target, method)
      const token = requireAccessToken(config.getAccessToken)
      const body = buildJsonBody(source, allowedKeys)
      try {
        const data = await requestValidated(
          client,
          method,
          target,
          token,
          schema,
          signal,
          body,
        )
        return { kind: 'success', data }
      } catch (error: unknown) {
        if (!isUnauthorized(error)) throw error

        const recovery = await recoverSession(config.sessionRecovery)
        return recovery === 'recovered'
          ? confirmationOutcome()
          : sessionOutcome(recovery)
      }
    },
    async remove({ target, schema, signal }) {
      assertUserTarget(config.apiBaseUrl, target, 'DELETE')
      const token = requireAccessToken(config.getAccessToken)
      try {
        const data = await requestValidated(
          client,
          'DELETE',
          target,
          token,
          schema,
          signal,
        )
        return { kind: 'success', data }
      } catch (error: unknown) {
        if (!isUnauthorized(error)) throw error

        const recovery = await recoverSession(config.sessionRecovery)
        return recovery === 'recovered'
          ? confirmationOutcome()
          : sessionOutcome(recovery)
      }
    },
  }
}
