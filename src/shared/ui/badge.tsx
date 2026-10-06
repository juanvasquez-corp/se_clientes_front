import type { BadgeVariant } from '../utils/presentation'

export type { BadgeVariant } from '../utils/presentation'

const VARIANT_CLASSES = {
  'role-superadmin': 'bg-brand-soft text-brand-primary',
  'role-master': 'bg-brand-info text-brand-link',
  'role-visualizer': 'bg-surface-page text-text-secondary',
  'status-active': 'bg-brand-soft text-brand-primary',
  'status-inactive': 'bg-status-danger/10 text-status-danger',
} as const satisfies Record<BadgeVariant, string>

interface BadgeProps {
  children: string
  variant: BadgeVariant
}

function isStatusVariant(variant: BadgeVariant): boolean {
  return variant === 'status-active' || variant === 'status-inactive'
}

export function Badge({ children, variant }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${VARIANT_CLASSES[variant]}`}
      data-variant={variant}
    >
      {isStatusVariant(variant) ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  )
}
