import { describe, expect, it } from 'vitest'

import { validationErrorDetailSchema } from '../../contracts/schemas/error'
import { mapValidationIssues } from './validation-errors'

describe('mapValidationIssues', () => {
  it('maps known FastAPI locations to explicitly allowed fields', () => {
    const result = mapValidationIssues(
      [
        { type: 'value_error', loc: ['body', 'email'], msg: 'Correo inválido' },
        { type: 'missing', loc: ['query', 'page'], msg: 'Página requerida' },
      ],
      ['email', 'page'] as const,
    )

    expect(result).toEqual({
      fields: {
        email: 'Correo inválido',
        page: 'Página requerida',
      },
      general: [],
    })
  })

  it('keeps unknown, empty, nested and non-allowlisted locations as general errors', () => {
    const result = mapValidationIssues(
      [
        { type: 'unknown', loc: ['body', 'unknown'], msg: 'Campo desconocido' },
        { type: 'general', loc: [], msg: 'Error general' },
        {
          type: 'nested',
          loc: ['body', 'profile', 'email'],
          msg: 'Ubicación anidada',
        },
        { type: 'index', loc: ['body', 0], msg: 'Índice no asociable' },
        { type: 'prefix', loc: ['response', 'email'], msg: 'Prefijo desconocido' },
        { type: 'known', loc: ['body', 'email'], msg: 'Correo inválido' },
      ],
      ['email'] as const,
    )

    expect(result).toEqual({
      fields: { email: 'Correo inválido' },
      general: [
        'Campo desconocido',
        'Error general',
        'Ubicación anidada',
        'Índice no asociable',
        'Prefijo desconocido',
      ],
    })
  })

  it('keeps the first issue when a field has duplicate errors', () => {
    const result = mapValidationIssues(
      [
        { type: 'first', loc: ['body', 'email'], msg: 'Primer error' },
        { type: 'second', loc: ['body', 'email'], msg: 'Segundo error' },
      ],
      ['email'] as const,
    )

    expect(result).toEqual({ fields: { email: 'Primer error' }, general: [] })
  })

  it.each(['__proto__', 'constructor', 'prototype'] as const)(
    'never assigns the reserved %s key even when allowlisted',
    (reservedField) => {
      const result = mapValidationIssues(
        [{ type: 'reserved', loc: ['body', reservedField], msg: 'No asignar' }],
        [reservedField],
      )

      expect(result).toEqual({ fields: {}, general: ['No asignar'] })
      expect(Object.keys(result.fields)).toEqual([])
      expect(Object.getPrototypeOf(result.fields)).toBe(Object.prototype)
    },
  )

  it('does not map arbitrary fields that are absent from the allowlist', () => {
    const result = mapValidationIssues(
      [{ type: 'arbitrary', loc: ['body', 'arbitrary'], msg: 'No permitido' }],
      ['email'] as const,
    )

    expect(result.fields).not.toHaveProperty('arbitrary')
    expect(result.general).toEqual(['No permitido'])
  })

  it('uses only issues already stripped of input and context by the schema', () => {
    const parsed = validationErrorDetailSchema.safeParse({
      detail: [
        {
          type: 'string_too_short',
          loc: ['body', 'psswd'],
          msg: 'Valor demasiado corto',
          input: 'private-password-value',
          ctx: { private: 'private-context-value' },
        },
      ],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const result = mapValidationIssues(parsed.data.detail, ['psswd'] as const)

    expect(result).toEqual({
      fields: { psswd: 'Valor demasiado corto' },
      general: [],
    })
    expect(JSON.stringify(result)).not.toContain('private-')
  })
})
