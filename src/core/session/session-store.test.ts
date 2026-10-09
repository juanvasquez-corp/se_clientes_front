import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSessionStore } from './session-store'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('session store memory policy', () => {
  it('creates independent unknown stores without persistence or serialization side effects', () => {
    const storageGetItem = vi.spyOn(Storage.prototype, 'getItem')
    const storageSetItem = vi.spyOn(Storage.prototype, 'setItem')
    const storageRemoveItem = vi.spyOn(Storage.prototype, 'removeItem')
    const stringify = vi.spyOn(JSON, 'stringify')
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const cookieGet = vi.spyOn(Document.prototype, 'cookie', 'get')
    const cookieSet = vi.spyOn(Document.prototype, 'cookie', 'set')
    const firstStore = createSessionStore()

    firstStore.getState().stageTokens({
      accessToken: 'access-value',
      tokenType: 'bearer',
      expiresIn: 120,
      csrfToken: 'csrf-value',
    })
    const reloadedStore = createSessionStore()

    expect(firstStore.getState()).toMatchObject({
      status: 'unknown',
      phase: 'login-profile',
    })
    expect(reloadedStore.getState()).toMatchObject({
      status: 'unknown',
      phase: 'initial',
      accessToken: undefined,
      tokenType: undefined,
      expiresIn: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(storageGetItem).not.toHaveBeenCalled()
    expect(storageSetItem).not.toHaveBeenCalled()
    expect(storageRemoveItem).not.toHaveBeenCalled()
    expect(stringify).not.toHaveBeenCalled()
    expect(consoleLog).not.toHaveBeenCalled()
    expect(consoleDebug).not.toHaveBeenCalled()
    expect(cookieGet).not.toHaveBeenCalled()
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('authenticates compatibly and a dead transition clears all usable session data', () => {
    const store = createSessionStore({ now: () => new Date('2026-10-08T12:00:00.000Z') })

    store.getState().stageTokens({
      accessToken: 'private-access-value',
      tokenType: 'bearer',
      expiresIn: 120,
      csrfToken: 'private-csrf-value',
    })
    store.getState().completeSession({
      userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
      name: 'Ana',
      lastName: null,
      email: 'ana@example.com',
      phoneNumber: null,
      role: 'master',
      isActive: true,
    })

    expect(store.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'private-access-value',
      accessExpiresAt: new Date('2026-10-08T12:02:00.000Z'),
      csrfToken: 'private-csrf-value',
      identity: { userUuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75' },
    })
    expect(store.getState().getAccessToken()).toBe('private-access-value')
    expect(store.getState().getCsrfToken()).toBe('private-csrf-value')

    store.getState().clearSession()

    expect(store.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(store.getState().getAccessToken()).toBeUndefined()
    expect(store.getState().getCsrfToken()).toBeUndefined()
  })
})
