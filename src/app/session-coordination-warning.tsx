import type { SessionCoordinationMode } from '../core/session/session-coordination'
import { Alert } from '../shared/ui/alert'

export interface SessionCoordinationWarningProps {
  readonly mode: SessionCoordinationMode
}

export function SessionCoordinationWarning({
  mode,
}: SessionCoordinationWarningProps) {
  if (mode === 'coordinated') return null

  return (
    <Alert.Information announcement="dynamic" title="Coordinación limitada">
      Si usas varias pestañas, una de ellas podría cerrar o invalidar tu sesión.
    </Alert.Information>
  )
}
