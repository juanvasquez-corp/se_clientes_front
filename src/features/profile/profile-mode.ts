import type { UserRole } from '../../contracts/schemas/user'

export type ProfileMode = 'editable' | 'readonly'

const PROFILE_MODES = {
  superadmin: 'editable',
  master: 'editable',
  visualizer: 'readonly',
} as const satisfies Record<UserRole, ProfileMode>

export function profileModeForRole(role: UserRole): ProfileMode {
  return PROFILE_MODES[role]
}
