import type { ReactNode } from 'react'

import type { UserResponse } from '../../contracts/schemas/user'
import { Badge } from '../../shared/ui/badge'
import { Card } from '../../shared/ui/card'
import {
  formatNullable,
  getInitials,
  rolePresentation,
  statusPresentation,
} from '../../shared/utils/presentation'
import { displayUserName } from './user-management'

interface UserDetailFactProps {
  readonly label: string
  readonly value: ReactNode
}

export interface UserDetailCardProps {
  readonly user: UserResponse
}

function UserDetailFact({ label, value }: UserDetailFactProps) {
  return (
    <div className="min-w-0 border-b border-border-default pb-4 last:border-b-0 last:pb-0 sm:last:border-b sm:last:pb-4">
      <dt className="text-sm font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1 break-words text-text-primary">{value}</dd>
    </div>
  )
}

export function UserDetailCard({ user }: UserDetailCardProps) {
  const initials = getInitials(user.name, user.last_name)
  const role = rolePresentation(user.role)
  const status = statusPresentation(user.is_active)

  return (
    <Card.Root>
      <Card.Header>
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-semibold text-brand-primary"
            data-slot="initials"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <Card.Title level={2}>{displayUserName(user)}</Card.Title>
            <Card.Description>Datos públicos de la cuenta registrada.</Card.Description>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <dl className="grid gap-4 sm:grid-cols-2 sm:gap-x-6">
          <UserDetailFact label="Nombre" value={user.name} />
          <UserDetailFact label="Apellido" value={formatNullable(user.last_name)} />
          <UserDetailFact label="Correo electrónico" value={user.email} />
          <UserDetailFact label="Teléfono" value={formatNullable(user.phone_number)} />
          <UserDetailFact
            label="Rol"
            value={<Badge variant={role.variant}>{role.label}</Badge>}
          />
          <UserDetailFact
            label="Estado"
            value={<Badge variant={status.variant}>{status.label}</Badge>}
          />
        </dl>
      </Card.Content>
    </Card.Root>
  )
}
