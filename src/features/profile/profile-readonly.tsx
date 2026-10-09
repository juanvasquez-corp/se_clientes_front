import type { ReactNode } from 'react'

import type { UserResponse } from '../../contracts/schemas/user'
import { Badge } from '../../shared/ui/badge'
import { Card } from '../../shared/ui/card'
import {
  formatNullable,
  rolePresentation,
  statusPresentation,
} from '../../shared/utils/presentation'

interface ProfileFactProps {
  readonly label: string
  readonly value: ReactNode
}

interface ProfileReadonlyProps {
  readonly profile: UserResponse
}

function ProfileFact({ label, value }: ProfileFactProps) {
  return (
    <div className="min-w-0 border-b border-border-default pb-4 last:border-b-0 last:pb-0 sm:last:border-b sm:last:pb-4">
      <dt className="text-sm font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1 break-words text-text-primary">{value}</dd>
    </div>
  )
}

export function ProfileReadonly({ profile }: ProfileReadonlyProps) {
  const role = rolePresentation(profile.rol)
  const status = statusPresentation(profile.is_active)

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title level={2}>Información personal</Card.Title>
        <Card.Description>Datos públicos asociados a tu cuenta.</Card.Description>
      </Card.Header>
      <Card.Content>
        <dl className="grid gap-4 sm:grid-cols-2 sm:gap-x-6">
          <ProfileFact label="Nombre" value={profile.name} />
          <ProfileFact label="Apellido" value={formatNullable(profile.last_name)} />
          <ProfileFact label="Correo electrónico" value={profile.email} />
          <ProfileFact label="Teléfono" value={formatNullable(profile.phone_number)} />
          <ProfileFact label="Rol" value={<Badge variant={role.variant}>{role.label}</Badge>} />
          <ProfileFact
            label="Estado"
            value={<Badge variant={status.variant}>{status.label}</Badge>}
          />
        </dl>
      </Card.Content>
    </Card.Root>
  )
}
