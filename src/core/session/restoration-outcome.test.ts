import { describe, expect, it } from 'vitest'

import { restorationOutcome } from './restoration-outcome'

describe('replacement restoration outcome matrix', () => {
  it.each(['csrf', 'refresh', 'profile'] as const)(
    'continues after %s succeeds',
    (step) => {
      expect(restorationOutcome(step, 'success')).toEqual({ kind: 'continue' })
    },
  )

  it.each(['csrf', 'refresh', 'profile'] as const)(
    'ends dead after %s returns 401',
    (step) => {
      expect(restorationOutcome(step, 'unauthorized')).toEqual({
        kind: 'dead',
        destination: '/login',
      })
    },
  )

  it.each([
    ['csrf', 'forbidden-access'],
    ['refresh', 'blocked-security'],
    ['profile', 'forbidden-access'],
  ] as const)('classifies %s 403 as %s', (step, kind) => {
    expect(restorationOutcome(step, 'forbidden')).toEqual({
      kind,
      destination: '/forbidden',
    })
  })

  it.each(['csrf', 'refresh', 'profile'] as const)(
    'makes %s network/503 unavailable with manual retry',
    (step) => {
      expect(restorationOutcome(step, 'unavailable')).toEqual({
        kind: 'unavailable',
        destination: '/unavailable',
        retry: 'manual',
      })
    },
  )
})
