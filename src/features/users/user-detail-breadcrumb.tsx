import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Icon } from '../../shared/ui/icon'
import {
  detailBreadcrumb,
  type DetailBreadcrumbViewport,
} from './user-management'

export type {
  DesktopDetailBreadcrumb,
  DetailBreadcrumbModel,
  DetailBreadcrumbViewport,
  MobileDetailBreadcrumb,
} from './user-management'

const MOBILE_BREAKPOINT_PX = 768

export interface UserDetailBreadcrumbProps {
  readonly currentLabel?: string
  readonly viewport?: DetailBreadcrumbViewport
}

function detectBrowserViewport(): DetailBreadcrumbViewport {
  if (typeof window === 'undefined') return 'desktop'
  return window.innerWidth < MOBILE_BREAKPOINT_PX ? 'mobile' : 'desktop'
}

export function UserDetailBreadcrumb({
  currentLabel,
  viewport,
}: UserDetailBreadcrumbProps) {
  const [detectedViewport, setDetectedViewport] = useState<DetailBreadcrumbViewport>(
    detectBrowserViewport,
  )

  useEffect(() => {
    if (viewport !== undefined || typeof window === 'undefined') return

    const handleResize = () => {
      setDetectedViewport(detectBrowserViewport())
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [viewport])

  const activeViewport = viewport ?? detectedViewport
  const model = detailBreadcrumb(activeViewport, currentLabel)

  return (
    <nav
      aria-label="Ruta de navegación"
      data-breadcrumb-viewport={model.kind}
    >
      {model.kind === 'desktop' ? (
        <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <li className="flex items-center">
            <Link
              className="inline-flex min-h-11 min-w-11 touch-manipulation items-center gap-1.5 rounded-sm px-2 font-medium text-brand-link transition-colors hover:bg-surface-card hover:text-brand-heading"
              to={model.parentHref}
            >
              {model.parentLabel}
            </Link>
          </li>
          <li aria-hidden="true" className="flex items-center text-text-muted">
            <Icon.Decorative name="icon-chevron-right" size="small" />
          </li>
          <li
            className="min-w-0 break-words px-1 font-semibold text-brand-heading"
            aria-current="page"
          >
            {model.currentLabel}
          </li>
        </ol>
      ) : (
        <ol className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
          <li className="flex items-center">
            <Link
              className="inline-flex min-h-11 min-w-11 touch-manipulation items-center gap-1.5 rounded-sm px-2 font-medium text-brand-link transition-colors hover:bg-surface-card hover:text-brand-heading"
              to={model.backHref}
            >
              <span aria-hidden="true" className="inline-flex rotate-180">
                <Icon.Decorative name="icon-chevron-right" size="small" />
              </span>
              <span>{model.backLabel}</span>
            </Link>
          </li>
          <li
            className="min-w-0 break-words px-1 font-semibold text-brand-heading"
            aria-current="page"
          >
            {model.currentLabel}
          </li>
        </ol>
      )}
    </nav>
  )
}
