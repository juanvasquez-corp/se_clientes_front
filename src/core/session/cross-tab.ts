import type { RemoteCacheController } from '../../app/query-client'
import type { UserRole } from '../../contracts/schemas/user'
import type { SessionCoordinator } from './session-coordinator'
import type { SessionIdentity, SessionStore } from './session-store'

export const SESSION_CHANNEL_NAME = 'aliar-session-coordination-v1'

export type SessionSignal =
  | 'logged-out'
  | 'session-replaced'
  | 'account-changed'

type InitialDestination = '/profile' | '/users'
type CrossTabDestination = InitialDestination | '/login'

interface MessageEventLike {
  readonly data: unknown
}

export interface BroadcastChannelPort {
  readonly postMessage: (message: unknown) => void
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEventLike) => void,
  ) => void
  readonly removeEventListener: (
    type: 'message',
    listener: (event: MessageEventLike) => void,
  ) => void
  readonly close: () => void
}

export type BroadcastChannelFactory = (name: string) => BroadcastChannelPort

export interface RoutePreservationInput {
  readonly previousUserUuid: string
  readonly restoredUserUuid: string
  readonly restoredRole: UserRole
  readonly currentPath: string
}

export interface CrossTabSessionConfig {
  readonly channelFactory: BroadcastChannelFactory
  readonly sessionStore: SessionStore
  readonly remoteCache: Pick<
    RemoteCacheController,
    'clearForLogout' | 'clearForAccountChange'
  >
  readonly coordinator: Pick<
    SessionCoordinator,
    'restoreReplacement' | 'cancelInitial'
  >
  readonly navigation: {
    readonly currentPath: () => string
    readonly replace: (destination: CrossTabDestination) => void
  }
  readonly initialDestination: (role: UserRole) => InitialDestination
}

export interface CrossTabSession {
  readonly publish: (signal: SessionSignal) => void
  readonly close: () => void
}

const USER_UUID_SEGMENT =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const USER_DETAIL_ROUTE = new RegExp(`^/users/${USER_UUID_SEGMENT}(?:/edit)?$`, 'iu')
function isAuthorizedPrivateRoute(role: UserRole, currentPath: string): boolean {
  if (currentPath === '/profile') return true
  if (role !== 'superadmin') return false
  return (
    currentPath === '/users' ||
    currentPath === '/users/new' ||
    USER_DETAIL_ROUTE.test(currentPath)
  )
}

function isSessionSignal(value: unknown): value is SessionSignal {
  return (
    value === 'logged-out' ||
    value === 'session-replaced' ||
    value === 'account-changed'
  )
}

export function shouldPreserveRoute(input: RoutePreservationInput): boolean {
  return (
    input.previousUserUuid === input.restoredUserUuid &&
    isAuthorizedPrivateRoute(input.restoredRole, input.currentPath)
  )
}

function parseSessionSignal(message: unknown): SessionSignal | undefined {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return undefined
  }

  const prototype = Object.getPrototypeOf(message) as unknown
  if (prototype !== Object.prototype && prototype !== null) return undefined

  const keys = Object.keys(message)
  if (keys.length !== 1 || keys[0] !== 'type') return undefined

  const signal = Reflect.get(message, 'type') as unknown
  return isSessionSignal(signal) ? signal : undefined
}

export function createCrossTabSession(
  config: CrossTabSessionConfig,
): CrossTabSession {
  const channel = config.channelFactory(SESSION_CHANNEL_NAME)
  let closed = false
  let replacementAttempt: Promise<void> | undefined

  const handleLoggedOut = () => {
    if (config.sessionStore.getState().status === 'dead') return
    config.coordinator.cancelInitial()
    config.sessionStore.getState().markDead()
    config.remoteCache.clearForLogout()
    config.navigation.replace('/login')
  }

  const restoreReplacedSession = async (
    previousIdentity: SessionIdentity | undefined,
    previousPath: string,
  ): Promise<void> => {
    if (previousIdentity === undefined) return
    const outcome = await config.coordinator.restoreReplacement(previousIdentity)
    if (closed || outcome !== 'authenticated') return

    const restoredIdentity = config.sessionStore.getState().identity
    if (restoredIdentity === undefined) return

    if (
      shouldPreserveRoute({
        previousUserUuid: previousIdentity.userUuid,
        restoredUserUuid: restoredIdentity.userUuid,
        restoredRole: restoredIdentity.role,
        currentPath: previousPath,
      })
    ) {
      return
    }

    config.navigation.replace(config.initialDestination(restoredIdentity.role))
  }

  const handleReplacement = () => {
    if (replacementAttempt !== undefined) return

    const previousIdentity = config.sessionStore.getState().identity
    const previousPath = config.navigation.currentPath()
    config.sessionStore.getState().beginRestoration()
    config.remoteCache.clearForAccountChange()

    const attempt = restoreReplacedSession(previousIdentity, previousPath)
    replacementAttempt = attempt
    void attempt.then(
      () => {
        if (replacementAttempt === attempt) replacementAttempt = undefined
      },
      () => {
        if (replacementAttempt === attempt) replacementAttempt = undefined
      },
    )
  }

  const onMessage = ({ data }: MessageEventLike) => {
    const signal = parseSessionSignal(data)
    if (signal === undefined || closed) return
    if (signal === 'logged-out') {
      handleLoggedOut()
      return
    }
    handleReplacement()
  }

  channel.addEventListener('message', onMessage)

  return {
    publish(signal) {
      if (closed || !isSessionSignal(signal)) return
      channel.postMessage({ type: signal })
    },
    close() {
      if (closed) return
      closed = true
      channel.removeEventListener('message', onMessage)
      channel.close()
      config.coordinator.cancelInitial()
      replacementAttempt = undefined
    },
  }
}
