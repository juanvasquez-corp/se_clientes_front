import type { BroadcastChannelFactory } from './cross-tab'
import { createSessionLock, type LockManagerPort } from './session-lock'
import type {
  SessionCriticalOperation,
  SessionLock,
} from './session-lock'

export type SessionCoordinationMode = 'coordinated' | 'limited'

export interface SessionCoordinationCapabilities {
  readonly lockManager: LockManagerPort | undefined
  readonly channelFactory: BroadcastChannelFactory | undefined
}

export interface SessionCoordination {
  readonly mode: SessionCoordinationMode
  readonly channelFactory: BroadcastChannelFactory | undefined
  readonly runCritical: SessionLock['run']
}

export function createSessionCoordination(
  capabilities: SessionCoordinationCapabilities,
): SessionCoordination {
  if (
    capabilities.lockManager === undefined ||
    capabilities.channelFactory === undefined
  ) {
    return {
      mode: 'limited',
      channelFactory: undefined,
      runCritical<T>(
        _operation: SessionCriticalOperation,
        task: () => Promise<T> | T,
        signal?: AbortSignal,
      ) {
        if (signal?.aborted === true) {
          const reason: unknown = signal.reason
          return Promise.reject(
            reason instanceof Error
              ? reason
              : new Error('Session operation was cancelled.'),
          )
        }
        return Promise.resolve().then(task)
      },
    }
  }

  const sessionLock = createSessionLock(capabilities.lockManager)
  return {
    mode: 'coordinated',
    channelFactory: capabilities.channelFactory,
    runCritical: sessionLock.run,
  }
}
