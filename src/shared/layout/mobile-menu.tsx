import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import type { UserRole } from '../../contracts/schemas/user'
import type { LogoutController } from '../../features/auth/logout-controller'
import type { InitialDestination } from '../../app/router/navigation-policy'
import { Icon } from '../ui/icon'
import { NavigationItems } from './navigation-items'

const PANEL_ID = 'mobile-navigation-panel'

export interface MobileMenuProps {
  readonly logoutController: LogoutController
  readonly pathname: string
  readonly role: UserRole
}

function focusMainContent(): void {
  window.requestAnimationFrame(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true })
  })
}

export function MobileMenu({ logoutController, pathname, role }: MobileMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const previousPathname = useRef(pathname)

  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const navigation = panelRef.current?.querySelector('nav')
      const target =
        navigation?.querySelector<HTMLElement>('[aria-current="page"]') ??
        navigation?.querySelector<HTMLElement>('a, button')
      target?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [open])

  const closeAndRestoreTrigger = () => {
    setOpen(false)
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus()
    })
  }

  const navigate = (destination: InitialDestination) => {
    setOpen(false)
    void router
      .navigate({ to: destination })
      .then(focusMainContent, () => undefined)
  }

  return (
    <div className="w-full lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <img
          className="h-auto w-28"
          src="/assets/aliar-logo.svg"
          alt="Aliar S.A."
          width="112"
          height="37"
        />
        <button
          ref={triggerRef}
          className="inline-flex size-11 touch-manipulation items-center justify-center rounded-sm border border-border-default bg-surface-card text-brand-heading"
          type="button"
          aria-controls={PANEL_ID}
          aria-expanded={open}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => {
            setOpen((current) => !current)
          }}
        >
          <Icon.Decorative name="icon-menu" size="navigation" />
        </button>
      </div>
      {open ? (
        <aside
          ref={panelRef}
          id={PANEL_ID}
          className="fixed inset-y-0 right-0 z-40 flex w-72 max-w-full flex-col bg-gradient-to-b from-brand-strong to-brand-primary-hover p-4 text-white shadow-brand-floating"
          aria-label="Menú móvil"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              closeAndRestoreTrigger()
            }
          }}
        >
          <div className="mb-6 flex items-center justify-between gap-3">
            <span className="font-semibold">Menú</span>
            <button
              className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-sm px-3 text-white"
              type="button"
              aria-label="Cerrar menú"
              onClick={closeAndRestoreTrigger}
            >
              Cerrar
            </button>
          </div>
          <nav className="flex min-h-0 flex-1" aria-label="Navegación móvil">
            <NavigationItems
              appearance="drawer"
              logoutController={logoutController}
              onNavigate={navigate}
              pathname={pathname}
              role={role}
            />
          </nav>
        </aside>
      ) : null}
    </div>
  )
}
