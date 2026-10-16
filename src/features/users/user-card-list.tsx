import { useId } from 'react'

import type { UserResponse } from '../../contracts/schemas/user'
import { Badge } from '../../shared/ui/badge'
import { rolePresentation, statusPresentation } from '../../shared/utils/presentation'
import {
  UserActions,
  type UserActionPolicy,
} from './user-actions'
import { displayUserName, validatedUserUuid } from './user-management'

export interface UserCardListProps {
  readonly users: readonly UserResponse[]
  readonly currentUserUuid: string
  readonly actionPolicy: UserActionPolicy
}

interface UserCardProps {
  readonly user: UserResponse
  readonly currentUserUuid: string
  readonly actionPolicy: UserActionPolicy
}

function UserCard({ user, currentUserUuid, actionPolicy }: UserCardProps) {
  const titleId = useId()
  if (validatedUserUuid(user) === undefined) return null

  const role = rolePresentation(user.role)
  const status = statusPresentation(user.is_active)

  return (
    <li className="min-w-0">
      <article
        className="grid min-w-0 gap-4 rounded-md border border-border-default bg-surface-card p-4 shadow-brand-card"
        aria-labelledby={titleId}
      >
        <header className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-brand-heading" id={titleId}>
            {displayUserName(user)}
          </h2>
          <p className="mt-1 [overflow-wrap:anywhere] text-sm text-text-secondary">
            {user.email}
          </p>
        </header>
        <dl className="flex flex-wrap items-center gap-2">
          <div>
            <dt className="sr-only">Rol</dt>
            <dd><Badge variant={role.variant}>{role.label}</Badge></dd>
          </div>
          <div>
            <dt className="sr-only">Estado</dt>
            <dd><Badge variant={status.variant}>{status.label}</Badge></dd>
          </div>
        </dl>
        <UserActions
          actionPolicy={actionPolicy}
          currentUserUuid={currentUserUuid}
          user={user}
        />
      </article>
    </li>
  )
}

export function UserCardList({ users, currentUserUuid, actionPolicy }: UserCardListProps) {
  return (
    <ul
      className="grid min-w-0 list-none gap-4 p-0"
      aria-label="Usuarios"
      data-user-card-list
    >
      {users.map((user) => (
        <UserCard
          key={user.uuid}
          user={user}
          currentUserUuid={currentUserUuid}
          actionPolicy={actionPolicy}
        />
      ))}
    </ul>
  )
}
