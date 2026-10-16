import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { userResponseSchema, type UserResponse } from '../../contracts/schemas/user'
import type { SessionFailureState } from '../../core/http/api-client'
import { ApiError } from '../../core/http/errors'
import { AsyncState } from '../../shared/ui/async-state'
import type { UserActionPolicy } from './user-actions'
import { UserDetailActions } from './user-detail-actions'
import { UserDetailBreadcrumb } from './user-detail-breadcrumb'
import { UserDetailCard } from './user-detail-card'
import {
  claimUserDetailQuery,
  retainUserDetailQuery,
  userDetailQueryOptions,
} from './user-detail-query'
import { displayUserName } from './user-management'
import type { UsersApi } from './users-api'

const BACK_TO_USERS_LINK_CLASSES =
  'inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-sm border border-border-default bg-surface-card px-5 font-semibold text-brand-heading no-underline transition-colors hover:bg-surface-page'

export interface UserDetailPageProps {
  readonly accountUuid: string
  readonly currentUserUuid: string
  readonly userUuid: string
  readonly usersApi: Pick<UsersApi, 'getUser'>
  readonly actionPolicy?: UserActionPolicy
  readonly onToggleStatus?: (user: UserResponse) => void
  readonly onDeleteUser?: (user: UserResponse) => void
  readonly statusSlot?: ReactNode
  readonly deleteSlot?: ReactNode
  readonly onSessionOutcome?: (state: SessionFailureState) => void
  readonly onSessionState?: (state: SessionFailureState) => void
}

function BackToUsersLink() {
  return (
    <Link className={BACK_TO_USERS_LINK_CLASSES} to="/users">
      Volver a usuarios
    </Link>
  )
}

function DetailErrorState({
  error,
  isFetching,
  retry,
}: {
  readonly error: Error
  readonly isFetching: boolean
  readonly retry: () => void
}) {
  const failure = error instanceof ApiError ? error.failure : undefined
  const recovery = {
    label: 'Reintentar',
    onRetry: retry,
    state: isFetching ? 'pending' : 'idle',
  } as const

  if (failure?.kind === 'forbidden') {
    return (
      <AsyncState.Error
        title="Acceso denegado"
        description="No tienes permisos para consultar el detalle de este usuario."
      />
    )
  }

  if (failure?.kind === 'unavailable') {
    return (
      <AsyncState.Unavailable
        title="Detalle no disponible"
        description="El servicio no está disponible temporalmente. Conservamos el contexto para que puedas reintentar."
        recovery={recovery}
      />
    )
  }

  return (
    <AsyncState.Error
      title="No pudimos cargar el detalle del usuario"
      description="No fue posible validar la información de la cuenta de forma segura."
      recovery={recovery}
    />
  )
}

export function UserDetailPage({
  accountUuid,
  actionPolicy,
  currentUserUuid,
  deleteSlot,
  onDeleteUser,
  onSessionOutcome,
  onSessionState,
  onToggleStatus,
  statusSlot,
  userUuid,
  usersApi,
}: UserDetailPageProps) {
  const queryClient = useQueryClient()
  const [retryError, setRetryError] = useState<Error | null>(null)
  const reportedSessionState = useRef<SessionFailureState | undefined>(undefined)
  retainUserDetailQuery({
    accountUuid,
    queryClient,
    userUuid,
    usersApi,
  })
  const detailQuery = useQuery(
    userDetailQueryOptions(usersApi, accountUuid, userUuid),
  )

  useEffect(
    () =>
      claimUserDetailQuery({
        accountUuid,
        queryClient,
        userUuid,
      }),
    [accountUuid, queryClient, userUuid],
  )

  const sessionState =
    detailQuery.data?.status === 'session' ? detailQuery.data.state : undefined

  useEffect(() => {
    if (sessionState === undefined) {
      reportedSessionState.current = undefined
      return
    }
    if (reportedSessionState.current === sessionState) return

    reportedSessionState.current = sessionState
    onSessionOutcome?.(sessionState)
    onSessionState?.(sessionState)
  }, [onSessionOutcome, onSessionState, sessionState])

  const activeError =
    detailQuery.error ?? (detailQuery.isFetching ? retryError : null)

  const retry = () => {
    if (detailQuery.isFetching) return
    if (detailQuery.error !== null) {
      setRetryError(detailQuery.error)
    }
    void detailQuery.refetch().finally(() => {
      setRetryError(null)
    })
  }

  const parsedUser =
    detailQuery.data?.status === 'found'
      ? userResponseSchema.safeParse(detailQuery.data.user)
      : undefined
  const foundUser = parsedUser?.success === true ? parsedUser.data : undefined
  const breadcrumbLabel =
    foundUser !== undefined ? displayUserName(foundUser) : undefined

  let content: ReactNode

  if (activeError !== null) {
    content = (
      <DetailErrorState
        error={activeError}
        isFetching={detailQuery.isFetching}
        retry={retry}
      />
    )
  } else if (detailQuery.isPending) {
    content = <AsyncState.Loading label="Cargando detalle de usuario" />
  } else if (detailQuery.isError) {
    content = (
      <DetailErrorState
        error={detailQuery.error}
        isFetching={detailQuery.isFetching}
        retry={retry}
      />
    )
  } else if (detailQuery.data.status === 'session') {
    content = (
      <AsyncState.Error
        title="Sesión no disponible"
        description="No fue posible mantener una sesión válida para consultar el detalle del usuario."
      />
    )
  } else if (detailQuery.data.status === 'not-found') {
    content = (
      <AsyncState.Empty
        title="Usuario no encontrado"
        description="La cuenta solicitada no existe o ya no está disponible en el directorio."
        titleLevel={2}
        action={<BackToUsersLink />}
      />
    )
  } else if (foundUser === undefined) {
    content = (
      <AsyncState.Error
        title="No pudimos cargar el detalle del usuario"
        description="No fue posible validar la información de la cuenta de forma segura."
        recovery={{
          label: 'Reintentar',
          onRetry: retry,
          state: detailQuery.isFetching ? 'pending' : 'idle',
        }}
      />
    )
  } else {
    content = (
      <div className="grid gap-6">
        <UserDetailCard user={foundUser} />
        <UserDetailActions
          actionPolicy={actionPolicy}
          currentUserUuid={currentUserUuid}
          deleteSlot={deleteSlot}
          onDeleteUser={onDeleteUser}
          onToggleStatus={onToggleStatus}
          statusSlot={statusSlot}
          user={foundUser}
        />
      </div>
    )
  }

  return (
    <section
      className="mx-auto grid w-full max-w-4xl gap-6"
      aria-labelledby="user-detail-title"
    >
      <UserDetailBreadcrumb currentLabel={breadcrumbLabel} />
      <header className="grid gap-1">
        <h1
          className="text-2xl font-semibold text-brand-heading"
          id="user-detail-title"
        >
          Detalle de usuario
        </h1>
        <p className="text-text-secondary">
          Consulta la información pública y las acciones permitidas para esta cuenta.
        </p>
      </header>
      <section aria-label="Contenido del detalle de usuario">{content}</section>
    </section>
  )
}
