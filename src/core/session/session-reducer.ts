import {
  deadSessionState,
  initialUnavailableSessionState,
  type SessionEvent,
  type SessionState,
} from './session-types'

export function accessExpiresAt(expiresIn: number, today: Date): Date | undefined {
  const now = today.getTime()
  if (!Number.isFinite(expiresIn) || expiresIn <= 0 || !Number.isFinite(now)) {
    return undefined
  }

  const expiration = now + Math.floor(expiresIn) * 1_000
  if (!Number.isSafeInteger(expiration)) return undefined

  const result = new Date(expiration)
  return Number.isFinite(result.getTime()) ? result : undefined
}

export function reduceSession(
  state: SessionState,
  event: SessionEvent,
): SessionState {
  switch (event.type) {
    case 'restoration-started':
      return {
        status: 'unknown',
        phase: 'restoring',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: undefined,
      }
    case 'restoration-csrf-accepted':
      if (state.status !== 'unknown' || state.phase !== 'restoring') return state
      return { ...state, csrfToken: event.csrfToken }
    case 'restoration-unavailable':
      return initialUnavailableSessionState
    case 'restoration-credentials-accepted':
      return {
        status: 'unknown',
        phase: 'restoration-profile',
        ...event.credentials,
        identity: undefined,
      }
    case 'restoration-forbidden':
      return {
        status: 'forbidden',
        reason: 'access-denied',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: undefined,
      }
    case 'replacement-refresh-blocked':
      return {
        status: 'blocked',
        operation: 'refresh',
        protection: 'required',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: event.identity,
      }
    case 'refresh-succeeded':
      if (state.status !== 'authenticated') return state
      return {
        status: 'authenticated',
        ...event.credentials,
        identity: state.identity,
      }
    case 'refresh-blocked':
      if (state.status !== 'authenticated') return state
      return {
        status: 'blocked',
        operation: 'refresh',
        protection: 'required',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: state.identity,
      }
    case 'refresh-unavailable':
      if (state.status !== 'authenticated') return state
      return {
        status: 'unavailable',
        context: 'security-recovery',
        operation: 'refresh',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: state.identity,
      }
    case 'logout-blocked':
      if (state.status !== 'authenticated') return state
      return {
        status: 'blocked',
        operation: 'logout',
        protection: 'required',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: state.identity,
      }
    case 'security-protection-restored':
      if (state.status === 'blocked') return { ...state, protection: 'restored' }
      if (state.status !== 'unavailable' || state.context !== 'security-recovery') {
        return state
      }
      return {
        status: 'blocked',
        operation: state.operation,
        protection: 'restored',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: state.identity,
      }
    case 'security-recovery-blocked':
      if (
        state.status !== 'blocked' &&
        !(state.status === 'unavailable' && state.context === 'security-recovery')
      ) {
        return state
      }
      return {
        status: 'blocked',
        operation: state.operation,
        protection: 'required',
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: state.identity,
      }
    case 'security-recovery-unavailable':
      if (
        state.status !== 'blocked' &&
        !(state.status === 'unavailable' && state.context === 'security-recovery')
      ) {
        return state
      }
      return {
        status: 'unavailable',
        context: 'security-recovery',
        operation: state.operation,
        accessToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        accessExpiresAt: undefined,
        csrfToken: undefined,
        identity: state.identity,
      }
    case 'security-refresh-succeeded':
      if (state.status !== 'blocked' || state.operation !== 'refresh') return state
      return {
        status: 'authenticated',
        ...event.credentials,
        identity: state.identity,
      }
    case 'credentials-accepted':
      return {
        status: 'unknown',
        phase: 'login-profile',
        ...event.credentials,
        identity: undefined,
      }
    case 'identity-validated':
      if (
        state.status !== 'unknown' ||
        (state.phase !== 'login-profile' && state.phase !== 'restoration-profile')
      ) {
        return state
      }
      return {
        status: 'authenticated',
        accessToken: state.accessToken,
        tokenType: state.tokenType,
        expiresIn: state.expiresIn,
        accessExpiresAt: state.accessExpiresAt,
        csrfToken: state.csrfToken,
        identity: event.identity,
      }
    case 'identity-updated':
      if (
        state.status !== 'authenticated' ||
        state.identity.userUuid !== event.identity.userUuid
      ) {
        return state
      }
      return { ...state, identity: event.identity }
    case 'session-rejected':
      return deadSessionState
  }
}
