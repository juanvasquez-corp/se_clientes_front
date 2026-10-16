import { describe, expect, it } from 'vitest'

import {
  ApiError,
  ContractError,
  classifyApiFailure,
  type ApiFailure,
} from './errors'
import { parseJsonResponse } from './parse-response'
import { userResponseSchema } from '../../contracts/schemas/user'

type FailureExpectation = Pick<
  ApiFailure,
  'kind' | 'status' | 'presentation' | 'preserveContext' | 'retry' | 'sessionRecovery'
>

describe('ContractError', () => {
  it.each(['invalid-json', 'invalid-shape'] as const)(
    'contains only a sanitized %s diagnostic',
    (reason) => {
      const error = new ContractError(reason)

      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({
        name: 'ContractError',
        kind: 'contract',
        reason,
        message: 'La respuesta del servidor no tiene un formato válido.',
      })
      expect(error).not.toHaveProperty('body')
      expect(error).not.toHaveProperty('cause')
    },
  )

  it('is returned by response parsing without retaining the rejected body', () => {
    const privateBody = '{"access_token":"private-access-value"'
    const result = parseJsonResponse(privateBody, userResponseSchema)

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.error).toBeInstanceOf(ContractError)
    expect(result.error.reason).toBe('invalid-json')
    expect(JSON.stringify(result.error)).not.toContain('private-access-value')
  })
})

describe('classifyApiFailure', () => {
  it.each<{
    label: string
    status: number | undefined
    body: unknown
    expected: FailureExpectation
  }>([
    {
      label: 'network failure',
      status: undefined,
      body: new Error('private network diagnostic'),
      expected: {
        kind: 'unavailable',
        status: undefined,
        presentation: 'unavailable',
        preserveContext: true,
        retry: 'manual',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '400',
      status: 400,
      body: { detail: 'Solicitud inválida' },
      expected: {
        kind: 'bad-request',
        status: 400,
        presentation: 'technical',
        preserveContext: true,
        retry: 'manual',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '401',
      status: 401,
      body: { detail: 'Sesión finalizada' },
      expected: {
        kind: 'unauthorized',
        status: 401,
        presentation: 'session-required',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'allowed',
      },
    },
    {
      label: '403',
      status: 403,
      body: { detail: 'Acceso denegado' },
      expected: {
        kind: 'forbidden',
        status: 403,
        presentation: 'access-denied',
        preserveContext: false,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '404 detail',
      status: 404,
      body: { detail: 'Usuario no encontrado' },
      expected: {
        kind: 'not-found',
        status: 404,
        presentation: 'not-found',
        preserveContext: false,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '409',
      status: 409,
      body: { detail: 'Debe permanecer un superadmin activo' },
      expected: {
        kind: 'conflict',
        status: 409,
        presentation: 'business-rule',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '413',
      status: 413,
      body: { detail: 'Payload too large' },
      expected: {
        kind: 'payload-too-large',
        status: 413,
        presentation: 'technical',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '415',
      status: 415,
      body: { detail: 'Unsupported media type' },
      expected: {
        kind: 'unsupported-media-type',
        status: 415,
        presentation: 'technical',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '422',
      status: 422,
      body: {
        detail: [{ type: 'missing', loc: ['body', 'email'], msg: 'Field required' }],
      },
      expected: {
        kind: 'validation',
        status: 422,
        presentation: 'validation',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '429',
      status: 429,
      body: { detail: 'Demasiados intentos' },
      expected: {
        kind: 'rate-limited',
        status: 429,
        presentation: 'rate-limited',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: '503',
      status: 503,
      body: { detail: 'Servicio no disponible' },
      expected: {
        kind: 'unavailable',
        status: 503,
        presentation: 'unavailable',
        preserveContext: true,
        retry: 'manual',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: 'other 4xx',
      status: 418,
      body: { detail: 'Unexpected client response' },
      expected: {
        kind: 'client-error',
        status: 418,
        presentation: 'technical',
        preserveContext: true,
        retry: 'none',
        sessionRecovery: 'forbidden',
      },
    },
    {
      label: 'other 5xx',
      status: 500,
      body: { detail: 'Unexpected server response' },
      expected: {
        kind: 'server-error',
        status: 500,
        presentation: 'technical',
        preserveContext: true,
        retry: 'manual',
        sessionRecovery: 'forbidden',
      },
    },
  ])('classifies $label with an explicit treatment', ({ status, body, expected }) => {
    expect(classifyApiFailure(status, body)).toMatchObject(expected)
  })

  it('classifies a contract error independently from HTTP responses', () => {
    expect(classifyApiFailure(200, new ContractError('invalid-shape'))).toMatchObject({
      kind: 'contract',
      status: 200,
      presentation: 'technical',
      preserveContext: true,
      retry: 'manual',
      sessionRecovery: 'forbidden',
    })
  })

  it.each([403, 409, 503])(
    'keeps classification and treatment stable for status %s across messages',
    (status) => {
      const first = classifyApiFailure(status, { detail: 'Primer mensaje' })
      const second = classifyApiFailure(status, { detail: 'Texto completamente distinto' })

      expect({ ...first, explanation: undefined }).toEqual({
        ...second,
        explanation: undefined,
      })
    },
  )

  it('exposes a validated 409 explanation without using it for classification', () => {
    expect(
      classifyApiFailure(409, { detail: 'No se puede eliminar el último superadmin' }),
    ).toMatchObject({
      kind: 'conflict',
      explanation: 'No se puede eliminar el último superadmin',
    })

    const rejectedBody = {
      detail: 'Mensaje no confiable',
      document_number: 'private-identity-value',
    }
    const failure = classifyApiFailure(409, rejectedBody)

    expect(failure.kind).toBe('conflict')
    expect(failure).not.toHaveProperty('explanation')
    expect(JSON.stringify(failure)).not.toContain('private-identity-value')
  })

  it('uses generic status treatment when detail does not match the expected shape', () => {
    expect(classifyApiFailure(404, { detail: ['invalid'] }).kind).toBe('client-error')
    expect(classifyApiFailure(422, { detail: 'invalid' }).kind).toBe('client-error')
  })

  it('does not retain unknown bodies in classified failures', () => {
    const body = {
      access_token: 'private-access-value',
      cookie: 'private-cookie-value',
      password: 'private-password-value',
      document_number: 'private-identity-value',
    }
    const failure = classifyApiFailure(500, body)

    expect(JSON.stringify(failure)).not.toContain('private')
  })
})

describe('ApiError', () => {
  it('wraps only the sanitized classified failure', () => {
    const failure = classifyApiFailure(409, { detail: 'Regla de negocio incumplida' })
    const error = new ApiError(failure)

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: 'ApiError',
      message: 'La API rechazó la operación.',
      failure,
    })
    expect(error).not.toHaveProperty('body')
    expect(error).not.toHaveProperty('cause')
  })

  it('copies only allowlisted failure diagnostics', () => {
    const failure = classifyApiFailure(500, undefined)
    Object.defineProperty(failure, 'issues', {
      value: [{ type: 'injected', loc: ['body', 'password'], msg: 'private-value' }],
      enumerable: true,
    })
    const contaminatedFailure = {
      ...failure,
      body: { access_token: 'private-access-value' },
    }
    const error = new ApiError(contaminatedFailure)

    expect(error.failure).not.toHaveProperty('body')
    expect(error.failure).not.toHaveProperty('issues')
    expect(JSON.stringify(error)).not.toContain('private')
  })
})
