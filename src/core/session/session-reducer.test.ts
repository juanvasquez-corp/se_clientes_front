import { describe, expect, it } from 'vitest'

import { accessExpiresAt, reduceSession } from './session-reducer'
import {
  initialSessionState,
  type SessionCredentials,
  type SessionIdentity,
} from './session-types'

const IDENTITY: SessionIdentity = {
  userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana',
  lastName: 'Pérez',
  email: 'ana@example.com',
  phoneNumber: '3001234567',
  role: 'master',
  isActive: true,
}

const CREDENTIALS: SessionCredentials = {
  accessToken: 'private-access-value',
  tokenType: 'bearer',
  expiresIn: 120,
  accessExpiresAt: new Date('2026-10-08T12:02:00.000Z'),
  csrfToken: 'private-csrf-value',
}

describe('session reducer', () => {
  it('starts unknown without usable credentials or identity', () => {
    expect(initialSessionState).toEqual({
      status: 'unknown',
      phase: 'initial',
      accessToken: undefined,
      tokenType: undefined,
      expiresIn: undefined,
      accessExpiresAt: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
  })

  it('authenticates only after credentials and a validated public identity are accepted', () => {
    const establishing = reduceSession(initialSessionState, {
      type: 'credentials-accepted',
      credentials: CREDENTIALS,
    })

    expect(establishing).toMatchObject({
      status: 'unknown',
      phase: 'login-profile',
      accessToken: CREDENTIALS.accessToken,
      identity: undefined,
    })
    expect(
      reduceSession(establishing, {
        type: 'identity-validated',
        identity: IDENTITY,
      }),
    ).toEqual({
      status: 'authenticated',
      ...CREDENTIALS,
      identity: IDENTITY,
    })
    expect(
      reduceSession(initialSessionState, {
        type: 'identity-validated',
        identity: IDENTITY,
      }),
    ).toBe(initialSessionState)
  })

  it('makes a non-recoverable session dead and removes credentials and identity', () => {
    const authenticated = reduceSession(
      reduceSession(initialSessionState, {
        type: 'credentials-accepted',
        credentials: CREDENTIALS,
      }),
      { type: 'identity-validated', identity: IDENTITY },
    )

    expect(reduceSession(authenticated, { type: 'session-rejected' })).toEqual({
      status: 'dead',
      accessToken: undefined,
      tokenType: undefined,
      expiresIn: undefined,
      accessExpiresAt: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
  })
})

describe('access expiration', () => {
  it('uses the injected clock and never rounds authority upward', () => {
    expect(accessExpiresAt(120.9, new Date('2026-10-08T12:00:00.000Z'))).toEqual(
      new Date('2026-10-08T12:02:00.000Z'),
    )
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an unsafe expiresIn value: %s',
    (expiresIn) => {
      expect(accessExpiresAt(expiresIn, new Date('2026-10-08T12:00:00.000Z'))).toBeUndefined()
    },
  )

  it('rejects an invalid injected clock', () => {
    expect(accessExpiresAt(120, new Date(Number.NaN))).toBeUndefined()
  })
})
