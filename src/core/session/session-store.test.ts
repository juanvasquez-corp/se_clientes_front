import { describe, expect, it, vi } from 'vitest'

import { createSessionStore } from './session-store'

describe('session store memory policy', () => {
  it('creates independent anonymous stores without persistence side effects', () => {
    const storageSetItem = vi.spyOn(Storage.prototype, 'setItem')
    const storageRemoveItem = vi.spyOn(Storage.prototype, 'removeItem')
    const firstStore = createSessionStore()
    const secondStore = createSessionStore()

    firstStore.getState().stageTokens({
      accessToken: 'access-value',
      tokenType: 'bearer',
      expiresIn: 120,
      csrfToken: 'csrf-value',
    })

    expect(firstStore.getState().status).toBe('establishing')
    expect(secondStore.getState()).toMatchObject({
      status: 'anonymous',
      accessToken: undefined,
      tokenType: undefined,
      expiresIn: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(storageSetItem).not.toHaveBeenCalled()
    expect(storageRemoveItem).not.toHaveBeenCalled()
  })
})
