import { describe, expect, it } from 'vitest'

import { apiErrorDetailSchema, validationErrorDetailSchema } from './error'

describe('API error detail schemas', () => {
  it('accepts the general detail response', () => {
    const response = { detail: 'Solicitud inválida' }

    expect(apiErrorDetailSchema.safeParse(response)).toEqual({
      success: true,
      data: response,
    })
  })

  it('accepts effective 422 issues and removes sensitive input and context', () => {
    const result = validationErrorDetailSchema.safeParse({
      detail: [
        {
          type: 'string_too_short',
          loc: ['body', 'password'],
          msg: 'String should have at least 15 characters',
          input: 'private-input',
          ctx: { min_length: 15 },
        },
      ],
    })

    expect(result).toEqual({
      success: true,
      data: {
        detail: [
          {
            type: 'string_too_short',
            loc: ['body', 'password'],
            msg: 'String should have at least 15 characters',
          },
        ],
      },
    })
  })

  it('rejects unknown properties and invalid validation locations', () => {
    expect(
      apiErrorDetailSchema.safeParse({ detail: 'Error', token: 'private' }).success,
    ).toBe(false)
    expect(
      validationErrorDetailSchema.safeParse({
        detail: [{ type: 'missing', loc: ['body', null], msg: 'Required' }],
      }).success,
    ).toBe(false)
  })
})
