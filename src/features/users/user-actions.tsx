import { Link } from '@tanstack/react-router'

import type { UserResponse } from '../../contracts/schemas/user'
import { Button } from '../../shared/ui/button'
import { Icon } from '../../shared/ui/icon'
import {
  canManageTarget,
  displayUserName,
  validatedUserUuid,
} from './user-management'

export interface UserActionPorts {
  readonly onChangeStatus: (user: UserResponse) => void
  readonly onDelete: (user: UserResponse) => void
}

export type UserActionPolicy =
  | { readonly kind: 'deferred' }
  | { readonly kind: 'available'; readonly ports: UserActionPorts }

interface UserActionsProps {
  readonly actionPolicy: UserActionPolicy
  readonly currentUserUuid: string
  readonly user: UserResponse
}

const ACTION_LINK_CLASSES =
  'inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-sm text-brand-heading transition-colors hover:bg-surface-page'

function publicUserContext(user: UserResponse): string {
  return `${displayUserName(user)} (${user.email})`
}

export function UserActions({ actionPolicy, currentUserUuid, user }: UserActionsProps) {
  const userUuid = validatedUserUuid(user)
  if (userUuid === undefined) return null

  const context = publicUserContext(user)
  const canManage = canManageTarget(currentUserUuid, userUuid)
  const statusAction = user.is_active ? 'Desactivar' : 'Activar'

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1"
      role="group"
      aria-label={`Acciones para ${context}`}
    >
      <Link
        className={ACTION_LINK_CLASSES}
        to="/users/$userUuid"
        params={{ userUuid }}
        aria-label={`Ver detalle de ${context}`}
        title={`Ver detalle de ${context}`}
      >
        <Icon.Decorative name="icon-eye" />
      </Link>
      <Link
        className={ACTION_LINK_CLASSES}
        to="/users/$userUuid/edit"
        params={{ userUuid }}
        aria-label={`Editar a ${context}`}
        title={`Editar a ${context}`}
      >
        <Icon.Decorative name="icon-edit" />
      </Link>
      {canManage && actionPolicy.kind === 'available' ? (
        <>
          <Button.Secondary
            aria-label={`${statusAction} a ${context}`}
            onClick={() => {
              actionPolicy.ports.onChangeStatus(user)
            }}
          >
            {statusAction}
          </Button.Secondary>
          <Button.Icon
            icon="icon-trash"
            label={`Eliminar a ${context}`}
            onClick={() => {
              actionPolicy.ports.onDelete(user)
            }}
          />
        </>
      ) : null}
    </div>
  )
}
