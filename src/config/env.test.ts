import { describe, expect, it } from 'vitest'

import { isAllowedApiBaseUrl, parsePublicEnv } from './env'

describe('isAllowedApiBaseUrl', () => {
  it.each([
    ['/api', true],
    ['/api/users', true],
    ['http://localhost:8000/api', true],
    ['https://api.example.com/v1', true],
    ['ftp://api.example.com', false],
    ['api.example.com', false],
    ['', false],
  ])('validates %j as %s', (value, expected) => {
    expect(isAllowedApiBaseUrl(value)).toBe(expected)
  })
})

describe('parsePublicEnv', () => {
  it('returns the validated public environment', () => {
    expect(
      parsePublicEnv({ VITE_API_BASE_URL: ' https://api.example.com/v1 ' }),
    ).toEqual({ apiBaseUrl: 'https://api.example.com/v1' })
  })

  it.each([
    {},
    { VITE_API_BASE_URL: 8000 },
    { VITE_API_BASE_URL: 'not-a-valid-base-url' },
  ])('rejects absent or invalid public configuration', (source) => {
    expect(() => parsePublicEnv(source)).toThrow('VITE_API_BASE_URL')
  })

  it('does not include rejected values in its diagnostic', () => {
    const rejectedValue = 'private-value-that-must-not-leak'
    let caughtError: unknown

    try {
      parsePublicEnv({ VITE_API_BASE_URL: rejectedValue })
    } catch (error: unknown) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(Error)
    const message = caughtError instanceof Error ? caughtError.message : ''
    expect(message).not.toContain(rejectedValue)
  })
})
