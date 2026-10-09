export const SESSION_CRITICAL_LOCK_NAME = 'aliar-session-critical-v1'

export type SessionCriticalOperation = 'login' | 'refresh' | 'logout'

export interface LockManagerPort {
  readonly request: <T>(
    name: string,
    options: {
      readonly mode: 'exclusive'
      readonly signal?: AbortSignal
    },
    callback: () => Promise<T> | T,
  ) => Promise<T>
}

export interface SessionLock {
  readonly run: <T>(
    operation: SessionCriticalOperation,
    task: () => Promise<T> | T,
    signal?: AbortSignal,
  ) => Promise<T>
}

export function createSessionLock(lockManager: LockManagerPort): SessionLock {
  return {
    run(_operation, task, signal) {
      return lockManager.request(
        SESSION_CRITICAL_LOCK_NAME,
        signal === undefined
          ? { mode: 'exclusive' }
          : { mode: 'exclusive', signal },
        task,
      )
    },
  }
}
