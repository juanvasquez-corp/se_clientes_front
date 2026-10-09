import { Link } from '@tanstack/react-router'

import type { UserRole } from '../../contracts/schemas/user'
import type { LogoutController } from '../../features/auth/logout-controller'
import { LogoutDialog } from '../../features/auth/logout-dialog'
import {
  isUsersContext,
  navigationForRole,
  type InitialDestination,
  type NavigationItem,
} from '../../app/router/navigation-policy'
import { Icon, type IconName } from '../ui/icon'
import './sidebar.css'

export type NavigationAppearance = 'drawer' | 'sidebar'

export interface NavigationItemsProps {
  readonly appearance: NavigationAppearance
  readonly logoutController: LogoutController
  readonly onNavigate?: (destination: InitialDestination) => void
  readonly pathname: string
  readonly role: UserRole
}

function iconForLink(href: InitialDestination): IconName {
  return href === '/users' ? 'icon-users' : 'icon-user'
}

function isLinkActive(
  item: Extract<NavigationItem, { kind: 'link' }>,
  pathname: string,
) {
  return item.href === '/users' ? isUsersContext(pathname) : pathname === '/profile'
}

const ACTION_CLASSES = {
  drawer:
    'mt-6 border-t border-surface-card/30 pt-4 [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start',
  sidebar:
    'mt-auto [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-white [&_button:hover]:bg-brand-primary',
} as const satisfies Record<NavigationAppearance, string>

export function NavigationItems({
  appearance,
  logoutController,
  onNavigate,
  pathname,
  role,
}: NavigationItemsProps) {
  const items = navigationForRole(role)

  return (
    <ul className="flex min-h-0 w-full flex-1 flex-col gap-2 p-0" role="list">
      {items.map((item) => {
        if (item.kind === 'action') {
          return (
            <li className={ACTION_CLASSES[appearance]} key={item.action}>
              <LogoutDialog controller={logoutController} />
            </li>
          )
        }

        const active = isLinkActive(item, pathname)
        return (
          <li key={item.href}>
            <Link
              className={`sidebar__link flex min-h-11 items-center gap-3 rounded-lg border-l-4 px-3 py-2 font-medium no-underline transition-colors focus-visible:outline-offset-2 ${
                active
                  ? 'border-brand-accent bg-brand-primary'
                  : 'border-transparent hover:bg-brand-primary'
              }`}
              to={item.href}
              activeOptions={{ exact: true }}
              aria-current={active ? 'page' : undefined}
              onClick={(event) => {
                if (onNavigate === undefined) return
                event.preventDefault()
                onNavigate(item.href)
              }}
            >
              <Icon.Decorative name={iconForLink(item.href)} size="navigation" />
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
