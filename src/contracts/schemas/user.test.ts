import { describe, expect, it } from 'vitest'

import { paginatedUserResponseSchema, userResponseSchema } from './user'

const validUser = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: '3001234567',
  role: 'superadmin',
  is_active: true,
} as const

describe('userResponseSchema', () => {
  it('accepts the complete public user contract', () => {
    expect(userResponseSchema.safeParse(validUser)).toEqual({
      success: true,
      data: validUser,
    })
  })

  it.each(['document_number', 'id', 'password', 'password_hash', 'created_at'])(
    'rejects the non-public %s property',
    (property) => {
      expect(
        userResponseSchema.safeParse({
          ...validUser,
          [property]: 'sensitive-value',
        }).success,
      ).toBe(false)
    },
  )

  it.each([
    { ...validUser, uuid: 'not-a-uuid' },
    { ...validUser, role: 'admin' },
    { ...validUser, is_active: 'true' },
    { ...validUser, phone_number: undefined },
  ])('rejects invalid or incomplete public user data', (candidate) => {
    expect(userResponseSchema.safeParse(candidate).success).toBe(false)
  })
})

describe('paginatedUserResponseSchema', () => {
  it('accepts the paginated user contract', () => {
    const response = {
      total_records: 1,
      current_page: 1,
      total_pages: 1,
      page_size: 10,
      data: [validUser],
    }

    expect(paginatedUserResponseSchema.safeParse(response)).toEqual({
      success: true,
      data: response,
    })
  })

  it('rejects extra properties at the pagination boundary', () => {
    expect(
      paginatedUserResponseSchema.safeParse({
        total_records: 0,
        current_page: 1,
        total_pages: 1,
        page_size: 10,
        data: [],
        next_page: null,
      }).success,
    ).toBe(false)
  })
})
