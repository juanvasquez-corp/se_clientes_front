import { describe, expect, it } from 'vitest'

import {
  csrfResponseSchema,
  messageResponseSchema,
  tokenResponseSchema,
} from './auth'

describe('authentication success schemas', () => {
  it('accepts token, CSRF and message responses', () => {
    expect(
      tokenResponseSchema.safeParse({
        access_token: 'access-value',
        token_type: 'bearer',
        expires_in: 120,
        csrf_token: 'csrf-value',
      }).success,
    ).toBe(true)
    expect(csrfResponseSchema.safeParse({ csrf_token: 'csrf-value' }).success).toBe(
      true,
    )
    expect(messageResponseSchema.safeParse({ detail: 'Operación completa' }).success).toBe(
      true,
    )
  })

  it('rejects extra properties', () => {
    expect(
      tokenResponseSchema.safeParse({
        access_token: 'access-value',
        token_type: 'bearer',
        expires_in: 120,
        csrf_token: 'csrf-value',
        refresh_token: 'must-not-be-public',
      }).success,
    ).toBe(false)
  })

  it.each([
    { access_token: 'access-value', token_type: 'bearer', expires_in: '120' },
    { csrf_token: 123 },
    { detail: null },
  ])('rejects invalid or incomplete success data', (candidate) => {
    const schemas = [tokenResponseSchema, csrfResponseSchema, messageResponseSchema]

    expect(schemas.some((schema) => schema.safeParse(candidate).success)).toBe(false)
  })
})
