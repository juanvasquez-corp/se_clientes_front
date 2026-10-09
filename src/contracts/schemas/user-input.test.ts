import { describe, expect, it } from 'vitest'

import {
  emailInputSchema,
  nameInputSchema,
  nullableNameInputSchema,
  nullablePhoneInputSchema,
  normalizeOptionalField,
} from './user-input'

describe('reusable user input schemas', () => {
  it.each([
    ['', false],
    [' ', false],
    ['A', true],
    ['Á'.repeat(50), true],
    ['名'.repeat(51), false],
  ])('validates normalized name boundary %j', (name, accepted) => {
    expect(nameInputSchema.safeParse(name).success).toBe(accepted)
  })

  it('trims names while preserving Unicode and internal whitespace', () => {
    expect(nameInputSchema.parse('  María  José  ')).toBe('María  José')
  })

  it.each([
    [null, null],
    ['', null],
    [' \t ', null],
    ['  Núñez  ', 'Núñez'],
  ])('normalizes nullable names from %j', (lastName, expected) => {
    expect(nullableNameInputSchema.parse(lastName)).toBe(expected)
  })

  it('rejects a nullable name over 50 normalized characters', () => {
    expect(nullableNameInputSchema.safeParse(` ${'A'.repeat(51)} `).success).toBe(false)
  })

  it.each([
    ['123456', false],
    ['1234567', true],
    ['+57 (601) 234-5678', true],
    ['☎ número', true],
    ['1'.repeat(20), true],
    ['1'.repeat(21), false],
    ['', true],
    ['   ', true],
    [null, true],
  ])('validates nullable phone boundary %j', (phoneNumber, accepted) => {
    expect(nullablePhoneInputSchema.safeParse(phoneNumber).success).toBe(accepted)
  })

  it('normalizes an optional phone without inventing a character restriction', () => {
    expect(nullablePhoneInputSchema.parse('  +57 300-123  ')).toBe('+57 300-123')
  })

  it.each([
    ['  USER@Example.COM  ', 'user@example.com'],
    ['persona+perfil@example.com', 'persona+perfil@example.com'],
  ])('normalizes valid email %j', (email, expected) => {
    expect(emailInputSchema.parse(email)).toBe(expected)
  })

  it.each(['', 'invalid', '@example.com', `${'a'.repeat(255)}@example.com`])(
    'rejects invalid email %j',
    (email) => {
      expect(emailInputSchema.safeParse(email).success).toBe(false)
    },
  )
})

describe('normalizeOptionalField', () => {
  it('is pure and returns trimmed text or null', () => {
    const input = '  texto  '

    expect(normalizeOptionalField(input)).toBe('texto')
    expect(normalizeOptionalField(' \n ')).toBeNull()
    expect(input).toBe('  texto  ')
  })
})
