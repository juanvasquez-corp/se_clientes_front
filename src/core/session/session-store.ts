import { createStore, type StoreApi } from 'zustand/vanilla'

import { accessExpiresAt, reduceSession } from './session-reducer'
import {
  initialSessionState,
  type SessionEvent,
  type SessionIdentity,
  type SessionState,
  type SessionTokens,
} from './session-types'

export type { SessionIdentity, SessionTokens } from './session-types'

export interface SessionStoreActions {
  readonly dispatch: (event: SessionEvent) => void
  readonly acceptTokens: (tokens: SessionTokens) => void
  readonly acceptRestorationTokens: (tokens: SessionTokens) => void
  readonly acceptIdentity: (identity: SessionIdentity) => void
  readonly acceptRefreshedTokens: (tokens: SessionTokens) => void
  readonly markRefreshBlocked: () => void
  readonly markRefreshUnavailable: () => void
  readonly markLogoutBlocked: () => void
  readonly beginRestoration: () => void
  readonly acceptRestorationCsrf: (csrfToken: string) => void
  readonly markRestorationUnavailable: () => void
  readonly markRestorationForbidden: () => void
  readonly markReplacementRefreshBlocked: (identity: SessionIdentity) => void
  readonly markSecurityProtectionRestored: () => void
  readonly markSecurityRecoveryBlocked: () => void
  readonly markSecurityRecoveryUnavailable: () => void
  readonly acceptSecurityRefreshedTokens: (tokens: SessionTokens) => void
  readonly markDead: () => void
  readonly getAccessToken: () => string | null | undefined
  readonly getCsrfToken: () => string | null | undefined
  readonly stageTokens: (tokens: SessionTokens) => void
  readonly completeSession: (identity: SessionIdentity) => void
  readonly clearSession: () => void
}

export type SessionStoreState = SessionState & SessionStoreActions
export type SessionStore = StoreApi<SessionStoreState>

export interface SessionStoreConfig {
  readonly now?: () => Date
}

export function createSessionStore(config: SessionStoreConfig = {}): SessionStore {
  const now = config.now ?? (() => new Date())

  return createStore<SessionStoreState>()((set, get) => {
    const dispatch = (event: SessionEvent) => {
      set((current) => ({ ...reduceSession(current, event), ...actions }))
    }
    const acceptTokens = (tokens: SessionTokens) => {
      const expiration = accessExpiresAt(tokens.expiresIn, now())
      if (expiration === undefined) {
        dispatch({ type: 'session-rejected' })
        return
      }
      dispatch({
        type: 'credentials-accepted',
        credentials: { ...tokens, accessExpiresAt: expiration },
      })
    }
    const acceptIdentity = (identity: SessionIdentity) => {
      dispatch({ type: 'identity-validated', identity })
    }
    const acceptRestorationTokens = (tokens: SessionTokens) => {
      const expiration = accessExpiresAt(tokens.expiresIn, now())
      if (expiration === undefined) {
        dispatch({ type: 'session-rejected' })
        return
      }
      dispatch({
        type: 'restoration-credentials-accepted',
        credentials: { ...tokens, accessExpiresAt: expiration },
      })
    }
    const acceptRefreshedTokens = (tokens: SessionTokens) => {
      const expiration = accessExpiresAt(tokens.expiresIn, now())
      if (expiration === undefined) {
        dispatch({ type: 'session-rejected' })
        return
      }
      dispatch({
        type: 'refresh-succeeded',
        credentials: { ...tokens, accessExpiresAt: expiration },
      })
    }
    const markRefreshBlocked = () => {
      dispatch({ type: 'refresh-blocked' })
    }
    const markRefreshUnavailable = () => {
      dispatch({ type: 'refresh-unavailable' })
    }
    const markLogoutBlocked = () => {
      dispatch({ type: 'logout-blocked' })
    }
    const markDead = () => {
      dispatch({ type: 'session-rejected' })
    }
    const beginRestoration = () => {
      dispatch({ type: 'restoration-started' })
    }
    const acceptRestorationCsrf = (csrfToken: string) => {
      dispatch({ type: 'restoration-csrf-accepted', csrfToken })
    }
    const markRestorationUnavailable = () => {
      dispatch({ type: 'restoration-unavailable' })
    }
    const markRestorationForbidden = () => {
      dispatch({ type: 'restoration-forbidden' })
    }
    const markReplacementRefreshBlocked = (identity: SessionIdentity) => {
      dispatch({ type: 'replacement-refresh-blocked', identity })
    }
    const markSecurityProtectionRestored = () => {
      dispatch({ type: 'security-protection-restored' })
    }
    const markSecurityRecoveryBlocked = () => {
      dispatch({ type: 'security-recovery-blocked' })
    }
    const markSecurityRecoveryUnavailable = () => {
      dispatch({ type: 'security-recovery-unavailable' })
    }
    const acceptSecurityRefreshedTokens = (tokens: SessionTokens) => {
      const expiration = accessExpiresAt(tokens.expiresIn, now())
      if (expiration === undefined) {
        dispatch({ type: 'session-rejected' })
        return
      }
      dispatch({
        type: 'security-refresh-succeeded',
        credentials: { ...tokens, accessExpiresAt: expiration },
      })
    }
    const getUsableCredential = (credential: 'accessToken' | 'csrfToken') => {
      const state = get()
      if (state.status === 'blocked' || state.status === 'unavailable') return null
      return state[credential]
    }
    const actions: SessionStoreActions = {
      dispatch,
      acceptTokens,
      acceptRestorationTokens,
      acceptIdentity,
      acceptRefreshedTokens,
      markRefreshBlocked,
      markRefreshUnavailable,
      markLogoutBlocked,
      markDead,
      beginRestoration,
      acceptRestorationCsrf,
      markRestorationUnavailable,
      markRestorationForbidden,
      markReplacementRefreshBlocked,
      markSecurityProtectionRestored,
      markSecurityRecoveryBlocked,
      markSecurityRecoveryUnavailable,
      acceptSecurityRefreshedTokens,
      getAccessToken: () => getUsableCredential('accessToken'),
      getCsrfToken: () => getUsableCredential('csrfToken'),
      stageTokens: acceptTokens,
      completeSession: acceptIdentity,
      clearSession: markDead,
    }

    return { ...initialSessionState, ...actions }
  })
}
