import { Outlet, useRouter, useRouterState } from '@tanstack/react-router'
import { type ReactNode } from 'react'
import { useStore } from 'zustand/react'

import { AppShell } from '../../shared/layout/app-shell'
import { PageTransition } from '../../shared/layout/page-transition'

export function UsersRoutePlaceholder() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <PrivateShell>
      {pathname === '/users' ? (
        <PageTransition>
          <section aria-label="Usuarios pendiente" />
        </PageTransition>
      ) : (
        <Outlet />
      )}
    </PrivateShell>
  )
}

export function PrivateShell({ children }: { readonly children: ReactNode }) {
  const router = useRouter()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const identity = useStore(router.options.context.session.store, (state) =>
    state.status === 'authenticated' ? state.identity : undefined,
  )

  if (identity === undefined) return null

  return (
    <AppShell
      identity={identity}
      logoutController={router.options.context.session.logoutController}
      pathname={pathname}
    >
      {children}
    </AppShell>
  )
}

export function NewUserRoutePlaceholder() {
  return (
    <PageTransition>
      <section aria-label="Creación de usuario pendiente" />
    </PageTransition>
  )
}

export function UserDetailRoutePlaceholder() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return pathname.endsWith('/edit') ? (
    <Outlet />
  ) : (
    <PageTransition>
      <section aria-label="Detalle de usuario pendiente" />
    </PageTransition>
  )
}

export function UserEditRoutePlaceholder() {
  return (
    <PageTransition>
      <section aria-label="Edición de usuario pendiente" />
    </PageTransition>
  )
}
