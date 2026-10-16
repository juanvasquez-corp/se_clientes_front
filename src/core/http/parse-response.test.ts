import { describe, expect, it } from 'vitest'

import { userResponseSchema } from '../../contracts/schemas/user'
import { parseJsonResponse } from './parse-response'

const validUser = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  role: 'master',
  is_active: true,
} as const

describe('parseJsonResponse', () => {
  it('returns validated data for a valid JSON response', () => {
    expect(parseJsonResponse(JSON.stringify(validUser), userResponseSchema)).toEqual({
      success: true,
      data: validUser,
    })
  })

  it.each([
    JSON.stringify({ ...validUser, document_number: 'private-value' }),
    JSON.stringify({ ...validUser, is_active: 'true' }),
  ])('rejects a JSON response outside the public contract', (body) => {
    expect(parseJsonResponse(body, userResponseSchema)).toMatchObject({
      success: false,
      error: { kind: 'contract', reason: 'invalid-shape' },
    })
  })

  it('rejects corrupt JSON without including its body in the error', () => {
    const sensitiveBody = '{"access_token":"private-value"'
    const result = parseJsonResponse(sensitiveBody, userResponseSchema)

    expect(result).toMatchObject({
      success: false,
      error: { kind: 'contract', reason: 'invalid-json' },
    })
    expect(JSON.stringify(result)).not.toContain('private-value')
  })
})
