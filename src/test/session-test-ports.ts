import type { SessionLock } from '../core/session/session-lock'

export const directCriticalOperations: Pick<SessionLock, 'run'> = {
  run<T>(_operation: 'login' | 'refresh' | 'logout', task: () => Promise<T> | T) {
    return Promise.resolve().then(task)
  },
}

export const silentSessionSignals = {
  publish() {
    return undefined
  },
}
