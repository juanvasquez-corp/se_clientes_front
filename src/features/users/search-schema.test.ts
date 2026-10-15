import { describe, expect, it } from 'vitest'

import { normalizeUserSearch, userSearchSchema } from './search-schema'

describe('userSearchSchema', () => {
  it('normalizes one complete exact email', () => {
    expect(normalizeUserSearch({ email: '  ANA@Example.COM  ' })).toEqual({
      email: 'ana@example.com',
    })
  })

  it.each([
    {},
    { email: '' },
    { email: '   ' },
    { email: 'ana' },
    { email: '@example.com' },
    { email: 'ana@example' },
    { email: 'ana@example.com', rol: 'master' },
    { email: 'ana@example.com', name: 'Ana' },
    { email: 'ana@example.com', cedula: '123' },
  ])('rejects an empty, partial or non-strict search: %o', (candidate) => {
    expect(userSearchSchema.safeParse(candidate).success).toBe(false)
  })
})
