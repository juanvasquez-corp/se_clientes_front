import type { ReactNode } from 'react'

import type { UserResponse } from '../../contracts/schemas/user'
import { Alert } from '../../shared/ui/alert'
import { profileModeForRole } from './profile-mode'
import { ProfileReadonly } from './profile-readonly'

interface ProfileContentProps {
  readonly profile: UserResponse
  readonly editableContent: ReactNode
}

export function ProfileContent({
  editableContent,
  profile,
}: ProfileContentProps) {
  const mode = profileModeForRole(profile.role)

  if (mode === 'editable') return editableContent

  return (
    <section className="grid gap-4" aria-label="Perfil de solo lectura">
      <Alert.Information title="Perfil de solo lectura">
        Puedes consultar tu perfil. No puedes editar información.
      </Alert.Information>
      <ProfileReadonly profile={profile} />
    </section>
  )
}
