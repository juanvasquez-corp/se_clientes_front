import { userUuidSchema, type UserResponse } from '../../contracts/schemas/user'
import { parsePublicUuid } from './users-api'

const DEFAULT_DETAIL_BREADCRUMB_LABEL = 'Detalle de usuario'
const NUMERIC_IDENTIFIER_PATTERN = /^\d{5,}$/u

export type DetailBreadcrumbViewport = 'desktop' | 'mobile'

export interface DesktopDetailBreadcrumb {
  readonly kind: 'desktop'
  readonly parentLabel: 'Usuarios'
  readonly parentHref: '/users'
  readonly currentLabel: string
}

export interface MobileDetailBreadcrumb {
  readonly kind: 'mobile'
  readonly backLabel: 'Volver a usuarios'
  readonly backHref: '/users'
  readonly currentLabel: string
}

export type DetailBreadcrumbModel =
  | DesktopDetailBreadcrumb
  | MobileDetailBreadcrumb

export interface DetailActionsDecision {
  readonly isSelf: boolean
  readonly canEdit: boolean
  readonly canToggleStatus: boolean
  readonly canDelete: boolean
  readonly showSelfRestrictionNotice: boolean
  readonly targetUserUuid: string | null
}

function normalizeDetailBreadcrumbLabel(currentLabel?: string): string {
  const trimmed = currentLabel?.trim() ?? ''
  if (
    trimmed.length === 0 ||
    parsePublicUuid(trimmed).kind === 'valid' ||
    NUMERIC_IDENTIFIER_PATTERN.test(trimmed)
  ) {
    return DEFAULT_DETAIL_BREADCRUMB_LABEL
  }
  return trimmed
}

export function detailBreadcrumb(
  viewport: DetailBreadcrumbViewport,
  currentLabel?: string,
): DetailBreadcrumbModel {
  const normalizedCurrentLabel = normalizeDetailBreadcrumbLabel(currentLabel)

  return viewport === 'desktop'
    ? {
        kind: 'desktop',
        parentLabel: 'Usuarios',
        parentHref: '/users',
        currentLabel: normalizedCurrentLabel,
      }
    : {
        kind: 'mobile',
        backLabel: 'Volver a usuarios',
        backHref: '/users',
        currentLabel: normalizedCurrentLabel,
      }
}

export function canManageTarget(currentUserUuid: string, targetUserUuid: string): boolean {
  const current = userUuidSchema.safeParse(currentUserUuid)
  const target = userUuidSchema.safeParse(targetUserUuid)

  if (!current.success || !target.success) return false
  return current.data.toLowerCase() !== target.data.toLowerCase()
}

export function detailActionsFor(
  currentUserUuid: unknown,
  targetUserUuid: unknown,
): DetailActionsDecision {
  const current = parsePublicUuid(currentUserUuid)
  const target = parsePublicUuid(targetUserUuid)

  if (current.kind === 'not-found' || target.kind === 'not-found') {
    return {
      isSelf: false,
      canEdit: false,
      canToggleStatus: false,
      canDelete: false,
      showSelfRestrictionNotice: false,
      targetUserUuid: null,
    }
  }

  const canManage = canManageTarget(current.userUuid, target.userUuid)
  const isSelf = !canManage

  return {
    isSelf,
    canEdit: true,
    canToggleStatus: canManage,
    canDelete: canManage,
    showSelfRestrictionNotice: isSelf,
    targetUserUuid: target.userUuid,
  }
}

export function displayUserName(user: UserResponse): string {
  const lastName = user.last_name?.trim()
  return lastName === undefined || lastName.length === 0
    ? user.name
    : `${user.name} ${lastName}`
}

export function validatedUserUuid(user: UserResponse): string | undefined {
  const result = userUuidSchema.safeParse(user.uuid)
  return result.success ? result.data : undefined
}
