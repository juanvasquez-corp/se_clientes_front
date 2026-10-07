import { createStore, type StoreApi } from 'zustand/vanilla'

import type { UserRole } from '../../contracts/schemas/user'

export interface SessionIdentity {
  readonly userUuid: string
  readonly name: string
  readonly lastName: string | null
  readonly email: string
  readonly phoneNumber: string | null
  readonly role: UserRole
  readonly isActive: boolean
}

export interface SessionTokens {
  readonly accessToken: string
  readonly tokenType: string
  readonly expiresIn: number
  readonly csrfToken: string
}

export type SessionStatus = 'anonymous' | 'establishing' | 'authenticated'

export interface SessionStoreState {
  readonly status: SessionStatus
  readonly accessToken: string | undefined
  readonly tokenType: string | undefined
  readonly expiresIn: number | undefined
  readonly csrfToken: string | undefined
  readonly identity: SessionIdentity | undefined
  readonly stageTokens: (tokens: SessionTokens) => void
  readonly completeSession: (identity: SessionIdentity) => void
  readonly clearSession: () => void
}

const EMPTY_SESSION = {
  status: 'anonymous',
  accessToken: undefined,
  tokenType: undefined,
  expiresIn: undefined,
  csrfToken: undefined,
  identity: undefined,
} as const

export type SessionStore = StoreApi<SessionStoreState>

export function createSessionStore(): SessionStore {
  return createStore<SessionStoreState>()((set) => ({
    ...EMPTY_SESSION,
    stageTokens: (tokens) => {
      set({
        status: 'establishing',
        accessToken: tokens.accessToken,
        tokenType: tokens.tokenType,
        expiresIn: tokens.expiresIn,
        csrfToken: tokens.csrfToken,
        identity: undefined,
      })
    },
    completeSession: (identity) => {
      set({ status: 'authenticated', identity })
    },
    clearSession: () => {
      set(EMPTY_SESSION)
    },
  }))
}
