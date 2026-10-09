import type { UserRole } from '../../contracts/schemas/user'
import type { LogoutController } from '../../features/auth/logout-controller'
import { NavigationItems } from './navigation-items'
import './sidebar.css'

export interface SidebarProps {
  readonly logoutController: LogoutController
  readonly pathname: string
  readonly role: UserRole
}

export function Sidebar({ logoutController, pathname, role }: SidebarProps) {
  return (
    <aside className="hidden min-h-screen w-60 flex-col bg-gradient-to-b from-brand-strong to-brand-primary-hover px-4 py-6 text-white lg:flex">
      <img
        className="mx-auto h-auto w-36"
        src="/assets/aliar-logo.svg"
        alt="Aliar S.A."
        width="144"
        height="47"
      />
      <nav className="mt-10 flex min-h-0 flex-1" aria-label="Navegación principal">
        <NavigationItems
          appearance="sidebar"
          logoutController={logoutController}
          pathname={pathname}
          role={role}
        />
      </nav>
    </aside>
  )
}
