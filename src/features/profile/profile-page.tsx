import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useStore } from 'zustand/react'

import { ApiError } from '../../core/http/errors'
import type { SessionStore } from '../../core/session/session-store'
import { PrivateShell } from '../../app/router/route-placeholders'
import { PageTransition } from '../../shared/layout/page-transition'
import { AsyncState } from '../../shared/ui/async-state'
import type { ProfileApi } from './profile-api'
import { profileQueryOptions } from './profile-query'
import { ProfileUpdateWorkflow } from './profile-update-workflow'

interface ProfilePageContentProps {
  readonly accountUuid: string
  readonly navigate: (
    destination: '/forbidden' | '/login' | '/unavailable',
  ) => void
  readonly profileApi: ProfileApi
  readonly sessionStore: SessionStore
}

export function ProfilePageContent({
  accountUuid,
  navigate,
  profileApi,
  sessionStore,
}: ProfilePageContentProps) {
  const profileQuery = useQuery(profileQueryOptions(profileApi, accountUuid))
  const retry = () => {
    void profileQuery.refetch()
  }

  let content
  if (profileQuery.isPending) {
    content = <AsyncState.Loading label="Cargando perfil" />
  } else if (profileQuery.isError) {
    const unavailable =
      profileQuery.error instanceof ApiError &&
      profileQuery.error.failure.kind === 'unavailable'
    content = unavailable ? (
      <AsyncState.Unavailable
        title="No pudimos cargar tu perfil"
        description="El servicio no está disponible. Tu sesión continúa activa."
        recovery={{
          label: 'Reintentar',
          onRetry: retry,
          state: profileQuery.isFetching ? 'pending' : 'idle',
        }}
      />
    ) : (
      <AsyncState.Error
        title="No pudimos cargar tu perfil"
        description="No fue posible cargar el perfil de forma segura."
        recovery={{
          label: 'Reintentar',
          onRetry: retry,
          state: profileQuery.isFetching ? 'pending' : 'idle',
        }}
      />
    )
  } else if (profileQuery.data.kind === 'session') {
    content = null
  } else {
    content = (
      <ProfileUpdateWorkflow
        navigate={navigate}
        profile={profileQuery.data.data}
        profileApi={profileApi}
        sessionStore={sessionStore}
      />
    )
  }

  return (
    <section className="mx-auto grid max-w-4xl gap-6" aria-labelledby="profile-title">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold text-brand-heading" id="profile-title">
          Mi perfil
        </h1>
        <p className="text-text-secondary">Consulta y actualiza la información de tu cuenta.</p>
      </header>
      {content}
    </section>
  )
}

export function ProfileRoute() {
  const router = useRouter()
  const sessionStore = router.options.context.session.store
  const profileApi = router.options.context.session.profileApi
  const identity = useStore(sessionStore, (state) =>
    state.status === 'authenticated' ? state.identity : undefined,
  )

  if (identity === undefined) return null

  const navigate = (
    destination: '/forbidden' | '/login' | '/unavailable',
  ) => {
    void router.navigate({ to: destination, replace: true })
  }

  return (
    <PrivateShell>
      <PageTransition>
        <ProfilePageContent
          accountUuid={identity.userUuid}
          navigate={navigate}
          profileApi={profileApi}
          sessionStore={sessionStore}
        />
      </PageTransition>
    </PrivateShell>
  )
}
