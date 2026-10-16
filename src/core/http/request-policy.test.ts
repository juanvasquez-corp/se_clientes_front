import { describe, expect, it } from 'vitest'

import { buildJsonBody, isKnownApiTarget } from './request-policy'

describe('buildJsonBody', () => {
  it('builds a new object with only explicitly allowed keys', () => {
    const source = Object.freeze({
      name: 'Ana',
      email: 'ana@example.com',
      role: 'master',
      is_active: true,
    })

    const body = buildJsonBody(source, ['name', 'email', 'role'] as const)

    expect(body).toEqual({ name: 'Ana', email: 'ana@example.com', role: 'master' })
    expect(body).not.toBe(source)
    expect(source).toHaveProperty('is_active', true)
  })

  it('omits undefined and preserves explicit null', () => {
    expect(
      buildJsonBody(
        {
          name: 'Ana',
          last_name: null,
          phone_number: undefined,
        },
        ['name', 'last_name', 'phone_number'] as const,
      ),
    ).toEqual({ name: 'Ana', last_name: null })
  })

  it.each(['__proto__', 'constructor', 'prototype'] as const)(
    'blocks the reserved %s key even when allowlisted',
    (reservedKey) => {
      const source: Record<string, unknown> = { name: 'Ana' }
      Object.defineProperty(source, reservedKey, {
        value: { polluted: true },
        enumerable: true,
      })

      const body = buildJsonBody(source, ['name', reservedKey] as const)

      expect(body).toEqual({ name: 'Ana' })
      expect(Object.keys(body)).toEqual(['name'])
      expect(Object.getPrototypeOf(body)).toBe(Object.prototype)
      expect({}).not.toHaveProperty('polluted')
    },
  )
})

describe('isKnownApiTarget', () => {
  it.each([
    ['/api', '/auth/login'],
    ['/api', '/api/auth/refresh'],
    ['/api', '/auth/csrf'],
    ['/api', '/auth/logout'],
    ['/api', '/users'],
    ['/api', '/users/create'],
    ['/api', '/users/me'],
    ['/api', '/users/search'],
    ['/api', '/users/2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'],
    ['/api', '/users/2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75/status'],
    ['https://api.example.com/api', 'users/me'],
    ['https://api.example.com/api', 'https://api.example.com/api/users'],
    ['https://api.example.com/api', '/api/users?page=2&size=25'],
  ])('allows known target %s + %s', (baseUrl, target) => {
    expect(isKnownApiTarget(baseUrl, target)).toBe(true)
  })

  it.each([
    ['https://api.example.com/api', 'https://external.example/api/users'],
    ['https://api.example.com/api', '//external.example/api/users'],
    ['https://api.example.com/api', 'https://api.example.com.evil.test/api/users'],
    ['https://api.example.com/api', 'https://user:pass@api.example.com/api/users'],
    ['https://api.example.com/api', 'ftp://api.example.com/api/users'],
    ['https://api.example.com:443/api', 'https://api.example.com:444/api/users'],
    ['/api', 'https://api.example.com/api/users'],
  ])('rejects untrusted origin target %s + %s', (baseUrl, target) => {
    expect(isKnownApiTarget(baseUrl, target)).toBe(false)
  })

  it.each([
    ['/api', '/users/../auth/login'],
    ['/api', '/users/%2e%2e/auth/login'],
    ['/api', '/users/%2Fauth%2Flogin'],
    ['/api', String.raw`/users\..\auth\login`],
    ['/api', '/users//me'],
    ['/api', '/users/not-a-uuid'],
    ['/api', '/users/2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75/unknown'],
    ['/api', '/auth/unknown'],
  ])('rejects unknown or ambiguous path %s + %s', (baseUrl, target) => {
    expect(isKnownApiTarget(baseUrl, target)).toBe(false)
  })

  it('allows only the documented pagination query without broadening the path allowlist', () => {
    expect(isKnownApiTarget('/api', '/users?page=1')).toBe(true)
    expect(isKnownApiTarget('/api', '/users?size=50&page=2')).toBe(true)
    expect(isKnownApiTarget('/api', '/unknown?next=/api/users')).toBe(false)
    expect(isKnownApiTarget('/api', '/users/me?next=/api/users')).toBe(false)
    expect(isKnownApiTarget('/api', '/users?page=1&page=2')).toBe(false)
    expect(isKnownApiTarget('/api', '/users?page=one')).toBe(false)
    expect(isKnownApiTarget('/api', '/users#private-fragment')).toBe(false)
  })

  it.each([
    ['', '/api/users'],
    ['//api.example.com/api', '/users'],
    ['ftp://api.example.com/api', '/users'],
    ['https://user:pass@api.example.com/api', '/users'],
    ['https://api.example.com/api/../private', '/users'],
  ])('rejects an unsafe configured base %s', (baseUrl, target) => {
    expect(isKnownApiTarget(baseUrl, target)).toBe(false)
  })
})
