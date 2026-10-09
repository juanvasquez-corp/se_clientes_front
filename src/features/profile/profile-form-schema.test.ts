import { describe, expect, it } from 'vitest'

import { buildProfileUpdate, profileFormSchema } from './profile-form-schema'

const validValues = {
  name: '  Ana María  ',
  last_name: '  López  ',
  phone_number: '  +57 300 123 4567  ',
  email: '  ANA@Example.COM  ',
}

describe('profileFormSchema', () => {
  it('is strict and normalizes all confirmed values', () => {
    expect(profileFormSchema.parse(validValues)).toEqual({
      name: 'Ana María',
      last_name: 'López',
      phone_number: '+57 300 123 4567',
      email: 'ana@example.com',
    })

    expect(profileFormSchema.safeParse({ ...validValues, rol: 'superadmin' }).success).toBe(
      false,
    )
  })

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects the own prototype-related key %s',
    (key) => {
      const candidate = JSON.parse(JSON.stringify(validValues)) as Record<string, unknown>
      Object.defineProperty(candidate, key, {
        value: 'unexpected',
        enumerable: true,
      })

      expect(profileFormSchema.safeParse(candidate).success).toBe(false)
    },
  )

  it('rejects inherited extra properties', () => {
    const candidate = Object.assign(Object.create({ cedula: 'secret' }) as object, validValues)

    expect(profileFormSchema.safeParse(candidate).success).toBe(false)
  })
})

describe('buildProfileUpdate', () => {
  it('returns exactly the four API properties and preserves optional confirmed values', () => {
    const input = structuredClone(validValues)

    const payload = buildProfileUpdate(input)

    expect(payload).toEqual({
      name: 'Ana María',
      last_name: 'López',
      phone_number: '+57 300 123 4567',
      email: 'ana@example.com',
    })
    expect(Object.keys(payload)).toEqual(['name', 'last_name', 'phone_number', 'email'])
    expect(input).toEqual(validValues)
  })

  it.each([
    [{ ...validValues, last_name: '' }, { last_name: null, phone_number: '+57 300 123 4567' }],
    [{ ...validValues, phone_number: '  ' }, { last_name: 'López', phone_number: null }],
    [
      { ...validValues, last_name: null, phone_number: null },
      { last_name: null, phone_number: null },
    ],
  ])('sends deliberate optional clears as null', (input, optionalValues) => {
    expect(buildProfileUpdate(input)).toEqual({
      name: 'Ana María',
      ...optionalValues,
      email: 'ana@example.com',
    })
  })

  it('rejects extras instead of forwarding administrative or confidential data', () => {
    expect(() =>
      buildProfileUpdate({
        ...validValues,
        rol: 'superadmin',
        is_active: false,
        cedula: 'secret',
        uuid: 'secret',
        created_at: 'secret',
        psswd: 'secret',
      }),
    ).toThrow()
  })
})
