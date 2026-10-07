import { describe, expect, it } from 'vitest'

import { loginInputSchema, normalizeLoginInput } from './login-schema'

describe('login credential validation', () => {
  it.each([
    ['', 'Ingresa tu correo electrónico.'],
    ['   ', 'Ingresa tu correo electrónico.'],
    ['correo-invalido', 'Ingresa un correo electrónico válido.'],
  ])('rejects invalid email %j with a Spanish UI message', (email, message) => {
    const result = loginInputSchema.safeParse({ email, psswd: 'secret' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({ path: ['email'], message })
    }
  })

  it('normalizes a valid email and keeps the API password field', () => {
    expect(
      normalizeLoginInput({
        email: '  Usuario@Example.COM  ',
        psswd: '  contraseña sin alterar  ',
      }),
    ).toEqual({
      email: 'usuario@example.com',
      psswd: '  contraseña sin alterar  ',
    })
  })

  it.each([
    ['', 'Ingresa tu contraseña.'],
    ['a'.repeat(129), 'La contraseña no puede superar 128 caracteres.'],
  ])('rejects a password outside its limits', (psswd, message) => {
    const result = loginInputSchema.safeParse({ email: 'user@example.com', psswd })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({ path: ['psswd'], message })
    }
  })

  it('accepts and preserves a password at the exact 128-character limit', () => {
    const psswd = ` ${'a'.repeat(126)} `

    expect(normalizeLoginInput({ email: 'USER@example.com', psswd })).toEqual({
      email: 'user@example.com',
      psswd,
    })
  })

  it.each([
    [{ email: 'user@example.com', psswd: 'secret', remember: true }],
    [{ email: 42, psswd: 'secret' }],
    [{ email: 'user@example.com', psswd: false }],
  ])('rejects extra properties and incorrect field types', (candidate) => {
    expect(loginInputSchema.safeParse(candidate).success).toBe(false)
  })
})
