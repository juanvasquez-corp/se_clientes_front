import { describe, expect, it, vi } from 'vitest'

import {
  createSessionCoordination,
  type SessionCoordinationCapabilities,
} from './session-coordination'
import type { BroadcastChannelFactory } from './cross-tab'
import type { LockManagerPort } from './session-lock'

function capabilities({
  broadcastChannel = true,
  locks = true,
}: {
  broadcastChannel?: boolean
  locks?: boolean
} = {}): SessionCoordinationCapabilities {
  const lockManager: LockManagerPort = {
    request: (_name, _options, callback) => Promise.resolve().then(callback),
  }
  const channelFactory: BroadcastChannelFactory = vi.fn(() => ({
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  }))
  return {
    lockManager: locks ? lockManager : undefined,
    channelFactory: broadcastChannel ? channelFactory : undefined,
  }
}

describe('session coordination capability detection', () => {
  it.each([
    [true, true, 'coordinated'],
    [false, true, 'limited'],
    [true, false, 'limited'],
    [false, false, 'limited'],
  ] as const)(
    'selects %s locks and %s channel as %s mode',
    (locks, broadcastChannel, expectedMode) => {
      expect(
        createSessionCoordination(
          capabilities({ locks, broadcastChannel }),
        ).mode,
      ).toBe(expectedMode)
    },
  )

  it('keeps one tab operational without blocking when coordination is limited', async () => {
    const storageGet = vi.spyOn(Storage.prototype, 'getItem')
    const storageSet = vi.spyOn(Storage.prototype, 'setItem')
    const task = vi.fn(() => Promise.resolve('completed'))
    const coordination = createSessionCoordination(
      capabilities({ locks: false, broadcastChannel: false }),
    )

    await expect(coordination.runCritical('refresh', task)).resolves.toBe(
      'completed',
    )

    expect(task).toHaveBeenCalledOnce()
    expect(storageGet).not.toHaveBeenCalled()
    expect(storageSet).not.toHaveBeenCalled()
  })
})
