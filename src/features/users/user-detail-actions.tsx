import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { UserResponse } from '../../contracts/schemas/user'
import { Alert } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'
import { Card } from '../../shared/ui/card'
import { Icon } from '../../shared/ui/icon'
import type { UserActionPolicy } from './user-actions'
import { detailActionsFor, displayUserName } from './user-management'

export type { DetailActionsDecision } from './user-management'

const EDIT_LINK_CLASSES =
  'primary-action-link inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center gap-2 rounded-sm bg-brand-primary px-5 font-semibold text-surface-card transition-colors hover:bg-brand-primary-hover'

export interface UserDetailActionsProps {
  readonly currentUserUuid: string
  readonly user: UserResponse
  readonly actionPolicy?: UserActionPolicy
  readonly onToggleStatus?: (user: UserResponse) => void
  readonly onDeleteUser?: (user: UserResponse) => void
  readonly statusSlot?: ReactNode
  readonly deleteSlot?: ReactNode
}

export function UserDetailActions({
  actionPolicy,
  currentUserUuid,
  deleteSlot,
  onDeleteUser,
  onToggleStatus,
  statusSlot,
  user,
}: UserDetailActionsProps) {
  const decision = detailActionsFor(currentUserUuid, user.uuid)
  if (!decision.canEdit || decision.targetUserUuid === null) return null

  const policyPorts =
    actionPolicy?.kind === 'available' ? actionPolicy.ports : undefined
  const handleToggleStatus = onToggleStatus ?? policyPorts?.onChangeStatus
  const handleDeleteUser = onDeleteUser ?? policyPorts?.onDelete
  const statusActionLabel = user.is_active
    ? 'Desactivar usuario'
    : 'Activar usuario'
  const contextLabel = `${displayUserName(user)} (${user.email})`

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title level={2}>Acciones administrativas</Card.Title>
        <Card.Description>
          Operaciones disponibles para la cuenta seleccionada.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="grid gap-4">
          {decision.showSelfRestrictionNotice ? (
            <Alert.Information title="Restricciones de tu propia cuenta">
              Tu rol y tu estado no pueden modificarse desde tu propia cuenta, ni puedes eliminarla.
            </Alert.Information>
          ) : null}
          <div
            className="flex flex-wrap items-center gap-3"
            role="group"
            aria-label={`Acciones administrativas para ${contextLabel}`}
          >
            <Link
              className={EDIT_LINK_CLASSES}
              to="/users/$userUuid/edit"
              params={{ userUuid: decision.targetUserUuid }}
            >
              <Icon.Decorative name="icon-edit" />
              <span>Editar usuario</span>
            </Link>
            {decision.canToggleStatus ? (
              statusSlot !== undefined ? (
                statusSlot
              ) : handleToggleStatus !== undefined ? (
                <Button.Secondary
                  onClick={() => {
                    handleToggleStatus(user)
                  }}
                >
                  {statusActionLabel}
                </Button.Secondary>
              ) : null
            ) : null}
            {decision.canDelete ? (
              deleteSlot !== undefined ? (
                deleteSlot
              ) : handleDeleteUser !== undefined ? (
                <Button.Destructive
                  onClick={() => {
                    handleDeleteUser(user)
                  }}
                >
                  <Icon.Decorative name="icon-trash" />
                  <span>Eliminar usuario</span>
                </Button.Destructive>
              ) : null
            ) : null}
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  )
}
