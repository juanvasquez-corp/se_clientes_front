import type { ReactNode } from 'react'

import type { SessionIdentity } from '../../core/session/session-store'
import type { LogoutController } from '../../features/auth/logout-controller'
import { MobileMenu } from './mobile-menu'
import { Sidebar } from './sidebar'

export interface AppShellProps {
  readonly children: ReactNode
  readonly identity: SessionIdentity
  readonly logoutController: LogoutController
  readonly pathname: string
}

const ROLE_LABELS = {
  superadmin: 'Superadministrador',
  master: 'Master',
  visualizer: 'Visualizador',
} as const satisfies Record<SessionIdentity['role'], string>

export function AppShell({
  children,
  identity,
  logoutController,
  pathname,
}: AppShellProps) {
  const displayName = [identity.name, identity.lastName].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-surface-page lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar
        logoutController={logoutController}
        pathname={pathname}
        role={identity.role}
      />
      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-border-default bg-surface-card px-4 py-3 shadow-sm lg:justify-end lg:px-6">
          <MobileMenu
            logoutController={logoutController}
            pathname={pathname}
            role={identity.role}
          />
          <div className="hidden text-right lg:block">
            <p className="font-semibold text-brand-heading">{displayName}</p>
            <p className="text-sm text-text-secondary">{ROLE_LABELS[identity.role]}</p>
          </div>
        </header>
        <main id="main-content" className="p-4 lg:p-6" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
