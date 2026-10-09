import { describe, expect, it, vi } from 'vitest'

import {
  createSessionLock,
  SESSION_CRITICAL_LOCK_NAME,
  type LockManagerPort,
} from './session-lock'

class SerialLockManager implements LockManagerPort {
  readonly requests: { name: string; mode: string }[] = []
  private tail: Promise<void> = Promise.resolve()

  request<T>(
    name: string,
    options: { readonly mode: 'exclusive' },
    callback: () => Promise<T> | T,
  ): Promise<T> {
    this.requests.push({ name, mode: options.mode })
    const result = this.tail.then(callback)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

describe('session critical operation lock', () => {
  it('serializes critical work from two tabs with one stable exclusive name', async () => {
    const manager = new SerialLockManager()
    const firstTab = createSessionLock(manager)
    const secondTab = createSessionLock(manager)
    const events: string[] = []
    let releaseFirst: (() => void) | undefined

    const first = firstTab.run('login', async () => {
      events.push('first-start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      events.push('first-end')
      return 'first-result'
    })
    const secondTask = vi.fn(() => {
      events.push('second')
      return 'second-result'
    })
    const second = secondTab.run('refresh', secondTask)

    await Promise.resolve()
    expect(events).toEqual(['first-start'])
    expect(secondTask).not.toHaveBeenCalled()
    releaseFirst?.()

    await expect(Promise.all([first, second])).resolves.toEqual([
      'first-result',
      'second-result',
    ])
    expect(events).toEqual(['first-start', 'first-end', 'second'])
    expect(manager.requests).toEqual([
      { name: SESSION_CRITICAL_LOCK_NAME, mode: 'exclusive' },
      { name: SESSION_CRITICAL_LOCK_NAME, mode: 'exclusive' },
    ])
    expect(SESSION_CRITICAL_LOCK_NAME).not.toMatch(/login|refresh|logout|token|csrf/i)
  })

  it('releases the lock after an operation throws', async () => {
    const manager = new SerialLockManager()
    const firstTab = createSessionLock(manager)
    const secondTab = createSessionLock(manager)
    const privateError = new Error('private operation failure')

    await expect(
      firstTab.run('logout', () => Promise.reject(privateError)),
    ).rejects.toBe(privateError)
    await expect(secondTab.run('login', () => Promise.resolve('continued'))).resolves.toBe(
      'continued',
    )
  })

  it('forwards an abort signal so queued work does not wait indefinitely', async () => {
    const task = vi.fn(() => 'must-not-run')
    const manager: LockManagerPort = {
      request<T>(
        _name: string,
        options: { readonly mode: 'exclusive'; readonly signal?: AbortSignal },
        callback: () => Promise<T> | T,
      ): Promise<T> {
        if (options.signal === undefined) return Promise.resolve().then(callback)
        return new Promise<T>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              const reason: unknown = options.signal?.reason
              reject(
                reason instanceof Error
                  ? reason
                  : new Error('Session lock wait was cancelled.'),
              )
            },
            { once: true },
          )
        })
      },
    }
    const controller = new AbortController()
    const pending = createSessionLock(manager).run('refresh', task, controller.signal)

    controller.abort(new Error('cancelled lock wait'))

    await expect(pending).rejects.toThrow('cancelled lock wait')
    expect(task).not.toHaveBeenCalled()
  })
})
