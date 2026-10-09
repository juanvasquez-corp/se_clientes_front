import { describe, expect, it, vi } from 'vitest'

import { createRemoteCacheController } from '../../app/query-client'
import type { UserRole } from '../../contracts/schemas/user'
import { homeForRole } from '../../features/auth/login-navigation'
import { createTestQueryClient } from '../../test/create-test-query-client'
import {
  createCrossTabSession,
  SESSION_CHANNEL_NAME,
  shouldPreserveRoute,
  type BroadcastChannelFactory,
  type BroadcastChannelPort,
  type SessionSignal,
} from './cross-tab'
import type { ReplacementRestorationResult } from './session-coordinator'
import { createSessionStore, type SessionIdentity } from './session-store'

const ACCOUNT_A = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const ACCOUNT_B = '3a2f7a2e-46f5-4c8a-b47d-524f1f2e1c76'

interface MessageEventLike {
  readonly data: unknown
}

class FakeBroadcastChannel implements BroadcastChannelPort {
  readonly sent: unknown[] = []
  readonly listeners = new Set<(event: MessageEventLike) => void>()
  closed = false

  constructor(
    readonly name: string,
    private readonly hub: FakeBroadcastHub,
  ) {}

  postMessage(message: unknown): void {
    this.sent.push(message)
    this.hub.deliver(this, message)
  }

  addEventListener(
    _type: 'message',
    listener: (event: MessageEventLike) => void,
  ): void {
    this.listeners.add(listener)
  }

  removeEventListener(
    _type: 'message',
    listener: (event: MessageEventLike) => void,
  ): void {
    this.listeners.delete(listener)
  }

  close(): void {
    this.closed = true
    this.listeners.clear()
  }

  receive(data: unknown): void {
    if (this.closed) return
    for (const listener of this.listeners) listener({ data })
  }
}

class FakeBroadcastHub {
  readonly channels: FakeBroadcastChannel[] = []
  readonly factory: BroadcastChannelFactory = (name) => {
    const channel = new FakeBroadcastChannel(name, this)
    this.channels.push(channel)
    return channel
  }

  deliver(sender: FakeBroadcastChannel, data: unknown): void {
    for (const channel of this.channels) {
      if (channel !== sender && channel.name === sender.name) channel.receive(data)
    }
  }
}

function identity(userUuid: string, role: UserRole): SessionIdentity {
  return {
    userUuid,
    name: 'Ana',
    lastName: null,
    email: 'ana@example.com',
    phoneNumber: null,
    role,
    isActive: true,
  }
}

function authenticate(
  store: ReturnType<typeof createSessionStore>,
  userUuid: string,
  role: UserRole,
) {
  store.getState().acceptTokens({
    accessToken: 'private-access-value',
    tokenType: 'bearer',
    expiresIn: 120,
    csrfToken: 'private-csrf-value',
  })
  store.getState().acceptIdentity(identity(userUuid, role))
}

function createTab({
  currentPath,
  factory,
  restore,
  role = 'superadmin',
  userUuid = ACCOUNT_A,
}: {
  currentPath: string
  factory: BroadcastChannelFactory
  restore?: (
    store: ReturnType<typeof createSessionStore>,
  ) => Promise<ReplacementRestorationResult>
  role?: UserRole
  userUuid?: string
}) {
  const sessionStore = createSessionStore()
  authenticate(sessionStore, userUuid, role)
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(['private', userUuid], { owner: userUuid })
  const replace = vi.fn()
  const cancelInitial = vi.fn()
  const restoreReplacement = vi.fn(
    restore === undefined
      ? () => Promise.resolve('authenticated' as const)
      : () => restore(sessionStore),
  )
  const session = createCrossTabSession({
    channelFactory: factory,
    sessionStore,
    remoteCache: createRemoteCacheController(queryClient),
    coordinator: { restoreReplacement, cancelInitial },
    navigation: { currentPath: () => currentPath, replace },
    initialDestination: homeForRole,
  })

  return {
    cancelInitial,
    queryClient,
    replace,
    restoreReplacement,
    session,
    sessionStore,
  }
}

describe('shouldPreserveRoute', () => {
  it.each([
    ['superadmin', '/profile', true],
    ['master', '/profile', true],
    ['visualizer', '/profile', true],
    ['superadmin', '/users', true],
    ['superadmin', '/users/new', true],
    ['superadmin', `/users/${ACCOUNT_B}`, true],
    ['superadmin', `/users/${ACCOUNT_B}/edit`, true],
    ['master', '/users', false],
    ['visualizer', '/users/new', false],
    ['superadmin', '/login', false],
    ['superadmin', '/forbidden', false],
    ['superadmin', '/unavailable', false],
    ['superadmin', '/dashboard', false],
  ] as const)(
    'evaluates %s access to %s as %s for the same account',
    (role, route, expected) => {
      expect(
        shouldPreserveRoute({
          previousUserUuid: ACCOUNT_A,
          restoredUserUuid: ACCOUNT_A,
          restoredRole: role,
          currentPath: route,
        }),
      ).toBe(expected)
    },
  )

  it('never preserves a private route for a different restored account', () => {
    expect(
      shouldPreserveRoute({
        previousUserUuid: ACCOUNT_A,
        restoredUserUuid: ACCOUNT_B,
        restoredRole: 'superadmin',
        currentPath: '/users',
      }),
    ).toBe(false)
  })
})

describe('cross-tab session signals', () => {
  it('publishes only an allowlisted signal with no session or identity data', () => {
    const hub = new FakeBroadcastHub()
    const tab = createTab({ currentPath: '/users', factory: hub.factory })

    tab.session.publish('session-replaced')

    expect(hub.channels[0]?.name).toBe(SESSION_CHANNEL_NAME)
    expect(hub.channels[0]?.sent).toEqual([{ type: 'session-replaced' }])
    const serialized = JSON.stringify(hub.channels[0]?.sent)
    expect(serialized).not.toMatch(
      /token|csrf|cookie|credential|uuid|email|role|profile|private-access/i,
    )

    tab.session.publish('unknown' as SessionSignal)
    expect(hub.channels[0]?.sent).toHaveLength(1)
  })

  it('handles repeated logged-out once without contacting the backend', () => {
    const hub = new FakeBroadcastHub()
    const receiver = createTab({ currentPath: '/users', factory: hub.factory })
    const sender = createTab({ currentPath: '/users', factory: hub.factory })

    sender.session.publish('logged-out')
    sender.session.publish('logged-out')

    expect(receiver.sessionStore.getState()).toMatchObject({
      status: 'dead',
      accessToken: undefined,
      csrfToken: undefined,
      identity: undefined,
    })
    expect(receiver.queryClient.getQueryCache().getAll()).toEqual([])
    expect(receiver.replace).toHaveBeenCalledOnce()
    expect(receiver.replace).toHaveBeenCalledWith('/login')
    expect(receiver.restoreReplacement).not.toHaveBeenCalled()
  })

  it('restores the same account once, clears cache and preserves an allowed route', async () => {
    const hub = new FakeBroadcastHub()
    const restore = (store: ReturnType<typeof createSessionStore>) => {
      authenticate(store, ACCOUNT_A, 'superadmin')
      return Promise.resolve('authenticated' as const)
    }
    const receiver = createTab({
      currentPath: '/users/new',
      factory: hub.factory,
      restore,
    })
    const sender = createTab({ currentPath: '/users', factory: hub.factory })

    sender.session.publish('session-replaced')
    sender.session.publish('session-replaced')
    await vi.waitFor(() => {
      expect(receiver.restoreReplacement).toHaveBeenCalledTimes(1)
    })

    expect(receiver.sessionStore.getState().status).toBe('authenticated')
    expect(receiver.queryClient.getQueryCache().getAll()).toEqual([])
    expect(receiver.replace).not.toHaveBeenCalled()
  })

  it.each([
    [ACCOUNT_B, 'master', '/users', '/profile'],
    [ACCOUNT_A, 'master', '/users/new', '/profile'],
    [ACCOUNT_B, 'superadmin', '/profile', '/users'],
  ] as const)(
    'uses the normative destination for restored account %s role %s from %s',
    async (restoredUuid, restoredRole, currentPath, destination) => {
      const hub = new FakeBroadcastHub()
      const restore = (store: ReturnType<typeof createSessionStore>) => {
        authenticate(store, restoredUuid, restoredRole)
        return Promise.resolve('authenticated' as const)
      }
      const receiver = createTab({ currentPath, factory: hub.factory, restore })
      const sender = createTab({ currentPath: '/profile', factory: hub.factory })

      sender.session.publish('account-changed')
      await vi.waitFor(() => {
        expect(receiver.replace).toHaveBeenCalledOnce()
      })

      expect(receiver.replace).toHaveBeenCalledWith(destination)
      expect(receiver.queryClient.getQueryCache().getAll()).toEqual([])
    },
  )

  it.each([
    null,
    'logged-out',
    {},
    { type: 'unknown' },
    { type: 'logged-out', accessToken: 'private' },
    Object.assign(Object.create({ polluted: true }), { type: 'logged-out' }),
  ])('ignores malformed or non-allowlisted messages: %j', (message) => {
    const hub = new FakeBroadcastHub()
    const receiver = createTab({ currentPath: '/users', factory: hub.factory })
    const external = hub.factory(SESSION_CHANNEL_NAME) as FakeBroadcastChannel

    external.postMessage(message)

    expect(receiver.sessionStore.getState().status).toBe('authenticated')
    expect(receiver.queryClient.getQueryCache().getAll()).toHaveLength(1)
    expect(receiver.replace).not.toHaveBeenCalled()
    expect(receiver.restoreReplacement).not.toHaveBeenCalled()
  })

  it('keeps content hidden when replacement restoration does not authenticate', async () => {
    const hub = new FakeBroadcastHub()
    const receiver = createTab({
      currentPath: '/users',
      factory: hub.factory,
      restore: (store) => {
        store.getState().markRestorationUnavailable()
        return Promise.resolve('unavailable')
      },
    })
    const sender = createTab({ currentPath: '/profile', factory: hub.factory })

    sender.session.publish('session-replaced')
    await vi.waitFor(() => {
      expect(receiver.restoreReplacement).toHaveBeenCalledOnce()
    })

    expect(receiver.sessionStore.getState()).toMatchObject({
      status: 'unavailable',
      accessToken: undefined,
      csrfToken: undefined,
    })
    expect(receiver.queryClient.getQueryCache().getAll()).toEqual([])
    expect(receiver.replace).not.toHaveBeenCalled()
  })

  it('removes its listener and closes the channel during cleanup', () => {
    const hub = new FakeBroadcastHub()
    const receiver = createTab({ currentPath: '/users', factory: hub.factory })
    const receiverChannel = hub.channels[0]
    const sender = createTab({ currentPath: '/users', factory: hub.factory })

    receiver.session.close()
    sender.session.publish('logged-out')

    expect(receiverChannel?.closed).toBe(true)
    expect(receiverChannel?.listeners.size).toBe(0)
    expect(receiver.sessionStore.getState().status).toBe('authenticated')
    expect(receiver.replace).not.toHaveBeenCalled()
    expect(receiver.cancelInitial).toHaveBeenCalledOnce()
  })
})
