import {
  apiErrorDetailSchema,
  validationErrorDetailSchema,
  type ValidationIssue,
} from '../../contracts/schemas/error'

export type ContractFailureReason = 'invalid-json' | 'invalid-shape'

export class ContractError extends Error {
  readonly kind = 'contract' as const
  readonly reason: ContractFailureReason

  constructor(reason: ContractFailureReason) {
    super('La respuesta del servidor no tiene un formato válido.')
    this.name = 'ContractError'
    this.reason = reason
  }
}

export type ApiFailureKind =
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'payload-too-large'
  | 'unsupported-media-type'
  | 'validation'
  | 'rate-limited'
  | 'unavailable'
  | 'client-error'
  | 'server-error'
  | 'contract'
  | 'unexpected'

export type FailurePresentation =
  | 'technical'
  | 'session-required'
  | 'access-denied'
  | 'not-found'
  | 'business-rule'
  | 'validation'
  | 'rate-limited'
  | 'unavailable'

interface ApiFailureBase {
  kind: ApiFailureKind
  status: number | undefined
  presentation: FailurePresentation
  preserveContext: boolean
  retry: 'none' | 'manual'
  sessionRecovery: 'allowed' | 'forbidden'
  explanation?: string
}

export type ApiFailure = ApiFailureBase &
  (
    | { kind: 'validation'; readonly issues: readonly ValidationIssue[] }
    | {
        kind: Exclude<ApiFailureKind, 'validation'>
        readonly issues?: never
      }
  )

interface FailurePolicy {
  presentation: FailurePresentation
  preserveContext: boolean
  retry: 'none' | 'manual'
  sessionRecovery: 'allowed' | 'forbidden'
}

const PRESERVE_TECHNICAL: FailurePolicy = {
  presentation: 'technical',
  preserveContext: true,
  retry: 'none',
  sessionRecovery: 'forbidden',
}

function createFailure(
  kind: Exclude<ApiFailureKind, 'validation'>,
  status: number | undefined,
  policy: FailurePolicy,
  explanation?: string,
): ApiFailure {
  return explanation === undefined
    ? { kind, status, ...policy }
    : { kind, status, ...policy, explanation }
}

function sanitizeValidationIssues(
  issues: readonly ValidationIssue[],
): readonly ValidationIssue[] {
  return Object.freeze(
    issues.map(({ type, loc, msg }) =>
      Object.freeze({ type, loc: Object.freeze([...loc]), msg }),
    ),
  )
}

function createValidationFailure(
  status: number | undefined,
  issues: readonly ValidationIssue[],
): ApiFailure {
  return {
    kind: 'validation',
    status,
    presentation: 'validation',
    preserveContext: true,
    retry: 'none',
    sessionRecovery: 'forbidden',
    issues: sanitizeValidationIssues(issues),
  }
}

export function classifyApiFailure(status: number | undefined, body: unknown): ApiFailure {
  if (body instanceof ContractError) {
    return createFailure('contract', status, {
      ...PRESERVE_TECHNICAL,
      retry: 'manual',
    })
  }

  if (status === undefined) {
    return createFailure('unavailable', undefined, {
      presentation: 'unavailable',
      preserveContext: true,
      retry: 'manual',
      sessionRecovery: 'forbidden',
    })
  }

  switch (status) {
    case 400:
      return createFailure('bad-request', status, {
        ...PRESERVE_TECHNICAL,
        retry: 'manual',
      })
    case 401:
      return createFailure('unauthorized', status, {
        presentation: 'session-required',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'allowed',
      })
    case 403:
      return createFailure('forbidden', status, {
        presentation: 'access-denied',
        preserveContext: false,
        retry: 'none',
        sessionRecovery: 'forbidden',
      })
    case 404:
      return apiErrorDetailSchema.safeParse(body).success
        ? createFailure('not-found', status, {
            presentation: 'not-found',
            preserveContext: false,
            retry: 'none',
            sessionRecovery: 'forbidden',
          })
        : createFailure('client-error', status, PRESERVE_TECHNICAL)
    case 409: {
      const detail = apiErrorDetailSchema.safeParse(body)
      return createFailure(
        'conflict',
        status,
        {
          presentation: 'business-rule',
          preserveContext: true,
          retry: 'none',
          sessionRecovery: 'forbidden',
        },
        detail.success ? detail.data.detail : undefined,
      )
    }
    case 413:
      return createFailure('payload-too-large', status, PRESERVE_TECHNICAL)
    case 415:
      return createFailure('unsupported-media-type', status, PRESERVE_TECHNICAL)
    case 422: {
      const detail = validationErrorDetailSchema.safeParse(body)
      return detail.success
        ? createValidationFailure(status, detail.data.detail)
        : createFailure('client-error', status, PRESERVE_TECHNICAL)
    }
    case 429:
      return createFailure('rate-limited', status, {
        presentation: 'rate-limited',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'forbidden',
      })
    case 503:
      return createFailure('unavailable', status, {
        presentation: 'unavailable',
        preserveContext: true,
        retry: 'manual',
        sessionRecovery: 'forbidden',
      })
    default:
      if (status >= 400 && status < 500) {
        return createFailure('client-error', status, PRESERVE_TECHNICAL)
      }
      if (status >= 500 && status < 600) {
        return createFailure('server-error', status, {
          ...PRESERVE_TECHNICAL,
          retry: 'manual',
        })
      }
      return createFailure('unexpected', status, PRESERVE_TECHNICAL)
  }
}

export class ApiError extends Error {
  readonly failure: ApiFailure
  readonly retryAfter?: string | null

  constructor(failure: ApiFailure, retryAfter?: string | null) {
    super('La API rechazó la operación.')
    this.name = 'ApiError'
    this.failure =
      failure.kind === 'validation'
        ? createValidationFailure(failure.status, failure.issues)
        : createFailure(
            failure.kind,
            failure.status,
            {
              presentation: failure.presentation,
              preserveContext: failure.preserveContext,
              retry: failure.retry,
              sessionRecovery: failure.sessionRecovery,
            },
            failure.kind === 'conflict' ? failure.explanation : undefined,
          )
    if (failure.kind === 'rate-limited') {
      this.retryAfter = retryAfter ?? null
    }
  }
}
