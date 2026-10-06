import type { components } from '../../contracts/generated/api'

export type UserRole = components['schemas']['UserResponse']['rol']

export type RoleBadgeVariant =
  | 'role-superadmin'
  | 'role-master'
  | 'role-visualizer'

export type StatusBadgeVariant = 'status-active' | 'status-inactive'

export type BadgeVariant = RoleBadgeVariant | StatusBadgeVariant

export interface Presentation<Variant extends BadgeVariant> {
  readonly label: string
  readonly variant: Variant
}

const ROLE_PRESENTATIONS = {
  superadmin: {
    label: 'Superadministrador',
    variant: 'role-superadmin',
  },
  master: {
    label: 'Master',
    variant: 'role-master',
  },
  visualizer: {
    label: 'Visualizador',
    variant: 'role-visualizer',
  },
} as const satisfies Record<UserRole, Presentation<RoleBadgeVariant>>

function firstLetter(value: string | null | undefined): string {
  return value?.trim().normalize('NFC').match(/\p{L}/u)?.[0] ?? ''
}

export function getInitials(
  name: string,
  lastName?: string | null,
): string {
  const initials = `${firstLetter(name)}${firstLetter(lastName)}`

  return initials ? initials.toLocaleUpperCase('es') : '?'
}

export function formatNullable(value: string | null): string {
  const normalizedValue = value?.trim() ?? ''

  return normalizedValue.length > 0 ? normalizedValue : 'No informado'
}

export function rolePresentation(
  role: UserRole,
): Presentation<RoleBadgeVariant> {
  return ROLE_PRESENTATIONS[role]
}

export function statusPresentation(
  isActive: boolean,
): Presentation<StatusBadgeVariant> {
  return isActive
    ? { label: 'Activo', variant: 'status-active' }
    : { label: 'Inactivo', variant: 'status-inactive' }
}
