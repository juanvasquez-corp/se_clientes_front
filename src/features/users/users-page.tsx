import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  paginatedUserResponseSchema,
  userResponseSchema,
  type UserResponse,
} from '../../contracts/schemas/user'
import type { SessionFailureState } from '../../core/http/api-client'
import { ApiError } from '../../core/http/errors'
import { AsyncState } from '../../shared/ui/async-state'
import { Icon } from '../../shared/ui/icon'
import { createListDirectoryState, type DirectoryState } from './directory-mode'
import { lastValidPageAfterDelete } from './pagination-domain'
import { Pagination } from './pagination'
import type { UserSearchInput } from './search-schema'
import type { UserActionPolicy } from './user-actions'
import { UserCardList } from './user-card-list'
import { UserSearch } from './user-search'
import { UserTable } from './user-table'
import {
  claimInitialUsersDirectoryQuery,
  createDirectoryQueryController,
  usersDirectoryQueryOptions,
} from './users-query'
import type { UsersApi } from './users-api'

export interface UsersPageProps {
  readonly accountUuid: string
  readonly currentUserUuid: string
  readonly usersApi: UsersApi
  readonly actionPolicy: UserActionPolicy
  readonly onSessionOutcome?: (state: SessionFailureState) => void
}

const CREATE_LINK_CLASSES =
  'primary-action-link inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center gap-2 rounded-sm bg-brand-primary px-5 font-semibold text-surface-card no-underline transition-colors hover:bg-brand-primary-hover'

function CreateUserLink() {
  return (
    <Link className={CREATE_LINK_CLASSES} to="/users/new">
      <Icon.Decorative name="icon-plus" />
      Crear usuario
    </Link>
  )
}

function UserRepresentations({
  actionPolicy,
  currentUserUuid,
  users,
}: {
  readonly actionPolicy: UserActionPolicy
  readonly currentUserUuid: string
  readonly users: readonly UserResponse[]
}) {
  return (
    <>
      <div className="hidden md:block" data-user-representation="table">
        <UserTable
          users={users}
          currentUserUuid={currentUserUuid}
          actionPolicy={actionPolicy}
        />
      </div>
      <div className="md:hidden" data-user-representation="cards">
        <UserCardList
          users={users}
          currentUserUuid={currentUserUuid}
          actionPolicy={actionPolicy}
        />
      </div>
    </>
  )
}

function DirectoryError({
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
        description="No tienes permisos para consultar este directorio."
      />
    )
  }

  if (failure?.kind === 'unavailable') {
    return (
      <AsyncState.Unavailable
        title="Directorio no disponible"
        description="El servicio no está disponible. Conservamos el contexto para que puedas reintentar."
        recovery={recovery}
      />
    )
  }

  return (
    <AsyncState.Error
      title="No pudimos cargar el directorio"
      description="No fue posible cargar los usuarios de forma segura."
      recovery={recovery}
    />
  )
}

export function UsersPage({
  accountUuid,
  currentUserUuid,
  usersApi,
  actionPolicy,
  onSessionOutcome,
}: UsersPageProps) {
  const queryClient = useQueryClient()
  const controller = useMemo(
    () =>
      createDirectoryQueryController({
        queryClient,
        accountUuid,
        initial: { page: 1, size: 10 },
      }),
    [accountUuid, queryClient],
  )
  const [mode, setMode] = useState<DirectoryState>(() =>
    createListDirectoryState({ page: 1, size: 10 }),
  )
  const interactionVersion = useRef(0)
  const correctionSignature = useRef<string | undefined>(undefined)
  const reportedSessionState = useRef<SessionFailureState | undefined>(undefined)
  const directoryQuery = useQuery(
    usersDirectoryQueryOptions(usersApi, accountUuid, mode),
  )

  useEffect(
    () => claimInitialUsersDirectoryQuery(queryClient, accountUuid),
    [accountUuid, queryClient],
  )
  const sessionState = directoryQuery.data?.kind === 'session'
    ? directoryQuery.data.state
    : undefined
  const parsedListPage =
    mode.kind === 'list' && directoryQuery.data?.kind === 'success'
      ? paginatedUserResponseSchema.safeParse(directoryQuery.data.data)
      : undefined
  const listPage = parsedListPage?.success ? parsedListPage.data : undefined
  const expectedTotalPages = listPage === undefined
    ? undefined
    : Math.max(1, Math.ceil(listPage.total_records / listPage.page_size))
  const listMetadataMismatch =
    mode.kind === 'list' &&
    listPage !== undefined &&
    (listPage.current_page !== mode.page ||
      listPage.page_size !== mode.size ||
      listPage.total_pages !== expectedTotalPages)
  const correctedListPage =
    mode.kind === 'list' && listPage !== undefined && !listMetadataMismatch
      ? lastValidPageAfterDelete(
          listPage.total_records,
          listPage.page_size,
          mode.page,
        )
      : undefined
  const shouldCorrectListPage =
    mode.kind === 'list' &&
    correctedListPage !== undefined &&
    correctedListPage !== mode.page

  useEffect(() => {
    if (sessionState === undefined) {
      reportedSessionState.current = undefined
      return
    }
    if (reportedSessionState.current === sessionState) return

    reportedSessionState.current = sessionState
    onSessionOutcome?.(sessionState)
  }, [onSessionOutcome, sessionState])

  useEffect(() => {
    if (!shouldCorrectListPage) {
      correctionSignature.current = undefined
      return
    }

    const signature = [
      accountUuid,
      mode.page,
      correctedListPage,
      listPage?.total_records ?? '',
      listPage?.total_pages ?? '',
    ].join(':')
    if (correctionSignature.current === signature) return

    correctionSignature.current = signature
    const owner = ++interactionVersion.current
    void controller.changePage(correctedListPage).then((nextMode) => {
      if (interactionVersion.current === owner) setMode(nextMode)
    })
  }, [
    accountUuid,
    controller,
    correctedListPage,
    listPage?.total_pages,
    listPage?.total_records,
    mode,
    shouldCorrectListPage,
  ])

  const retry = () => {
    void directoryQuery.refetch()
  }

  const search = async (input: UserSearchInput) => {
    const owner = ++interactionVersion.current
    const searchMode = await controller.submitSearch(input.email)
    if (interactionVersion.current === owner) setMode(searchMode)
  }

  const clearSearch = async () => {
    const owner = ++interactionVersion.current
    const listMode = await controller.clearSearch()
    if (interactionVersion.current === owner) setMode(listMode)
  }

  const changePage = (page: number) => {
    const owner = ++interactionVersion.current
    void controller.changePage(page).then((nextMode) => {
      if (interactionVersion.current === owner) setMode(nextMode)
    })
  }

  const searchNotFound = mode.kind === 'search' && directoryQuery.data?.kind === 'not-found'
  let results

  if (directoryQuery.isPending) {
    results = <AsyncState.Loading label="Cargando directorio de usuarios" />
  } else if (directoryQuery.isError) {
    results = (
      <DirectoryError
        error={directoryQuery.error}
        isFetching={directoryQuery.isFetching}
        retry={retry}
      />
    )
  } else if (directoryQuery.data.kind === 'session') {
    results = (
      <AsyncState.Error
        title="Sesión no disponible"
        description="No fue posible mantener una sesión válida para consultar el directorio."
      />
    )
  } else if (directoryQuery.data.kind === 'requires-confirmation') {
    results = (
      <AsyncState.Error
        title="No pudimos completar la búsqueda"
        description="Vuelve a confirmar la búsqueda para continuar."
        recovery={{
          label: 'Reintentar',
          onRetry: retry,
          state: directoryQuery.isFetching ? 'pending' : 'idle',
        }}
      />
    )
  } else if (directoryQuery.data.kind === 'not-found') {
    results = null
  } else if (mode.kind === 'list') {
    if (parsedListPage?.success !== true || listMetadataMismatch) {
      results = (
        <AsyncState.Error
          title="No pudimos cargar el directorio"
          description="No fue posible cargar los usuarios de forma segura."
          recovery={{
            label: 'Reintentar',
            onRetry: retry,
            state: directoryQuery.isFetching ? 'pending' : 'idle',
          }}
        />
      )
    } else if (shouldCorrectListPage) {
      results = <AsyncState.Loading label="Cargando última página disponible" />
    } else if (parsedListPage.data.data.length === 0) {
      results = (
        <AsyncState.Empty
          title="No hay usuarios registrados"
          description="Todavía no existen cuentas para mostrar en el directorio."
          titleLevel={2}
          action={<CreateUserLink />}
        />
      )
    } else {
      results = (
        <div className="grid gap-4">
          <UserRepresentations
            users={parsedListPage.data.data}
            currentUserUuid={currentUserUuid}
            actionPolicy={actionPolicy}
          />
          <Pagination
            totalRecords={parsedListPage.data.total_records}
            currentPage={parsedListPage.data.current_page}
            totalPages={parsedListPage.data.total_pages}
            pageSize={parsedListPage.data.page_size}
            interactionState={directoryQuery.isFetching ? 'pending' : 'idle'}
            onPageChange={changePage}
          />
        </div>
      )
    }
  } else {
    const user = userResponseSchema.safeParse(directoryQuery.data.data)
    results = user.success ? (
      <UserRepresentations
        users={[user.data]}
        currentUserUuid={currentUserUuid}
        actionPolicy={actionPolicy}
      />
    ) : (
      <AsyncState.Error
        title="No pudimos cargar el directorio"
        description="No fue posible cargar el usuario de forma segura."
        recovery={{
          label: 'Reintentar',
          onRetry: retry,
          state: directoryQuery.isFetching ? 'pending' : 'idle',
        }}
      />
    )
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6" aria-labelledby="users-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold text-brand-heading" id="users-title">
            Gestión de usuarios
          </h1>
          <p className="text-text-secondary">
            Consulta las cuentas del sistema y administra sus permisos.
          </p>
        </div>
        <CreateUserLink />
      </header>
      <UserSearch
        mode={mode}
        feedback={searchNotFound ? 'not-found' : 'idle'}
        interactionState={
          mode.kind === 'search' && directoryQuery.isFetching ? 'pending' : 'idle'
        }
        onSearch={search}
        onClear={clearSearch}
      />
      <section aria-label="Resultados del directorio">{results}</section>
    </section>
  )
}
