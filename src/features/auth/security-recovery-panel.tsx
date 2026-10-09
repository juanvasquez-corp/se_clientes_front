import { useEffect, useRef, useState } from 'react'

import { Alert } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'
import { Card } from '../../shared/ui/card'
import type {
  SecurityRecoveryController,
  SecurityRecoveryResult,
} from './security-recovery-controller'

type PanelState =
  | 'idle'
  | 'pending'
  | 'restored'
  | 'blocked'
  | 'unavailable'
  | 'dead'
  | 'retrying'
  | 'dispatched'

export interface SecurityRecoveryPanelProps {
  readonly controller: SecurityRecoveryController
}

export function SecurityRecoveryPanel({
  controller,
}: SecurityRecoveryPanelProps) {
  const [state, setState] = useState<PanelState>('idle')
  const pending = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const restoreProtection = async () => {
    if (pending.current) return
    pending.current = true
    setState('pending')
    const result: SecurityRecoveryResult =
      await controller.restoreProtection()
    if (!mounted.current) return
    pending.current = false
    setState(result.kind)
  }

  const retryOriginal = async () => {
    if (pending.current) return
    pending.current = true
    setState('retrying')
    const result = await controller.retryOriginal()
    if (!mounted.current) return
    pending.current = false
    setState(result.kind === 'dispatched' ? 'dispatched' : 'blocked')
  }

  const isPending = state === 'pending' || state === 'retrying'

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title level={2}>Protección de sesión</Card.Title>
        <Card.Description>
          No pudimos verificar la protección de tu sesión.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="grid gap-4">
          {state === 'restored' || state === 'retrying' || state === 'dispatched' ? (
            <Alert.Success announcement="dynamic" title="Protección restablecida">
              {state === 'dispatched'
                ? 'La operación se envió nuevamente.'
                : 'La protección fue restablecida.'}
            </Alert.Success>
          ) : null}
          {state === 'blocked' ? (
            <Alert.Error announcement="dynamic">
              No pudimos verificar la protección de tu sesión.
            </Alert.Error>
          ) : null}
          {state === 'unavailable' ? (
            <Alert.Information announcement="dynamic" title="Servicio no disponible">
              No pudimos restablecer la protección. Inténtalo nuevamente.
            </Alert.Information>
          ) : null}
          {state === 'dead' ? (
            <Alert.Information announcement="dynamic">
              La sesión ya no está disponible. Te dirigiremos al inicio de sesión.
            </Alert.Information>
          ) : null}
        </div>
      </Card.Content>
      <Card.Actions>
        {state === 'restored' || state === 'retrying' ? (
          <Button.Primary disabled={isPending} onClick={() => void retryOriginal()}>
            {state === 'retrying' ? 'Reintentando...' : 'Reintentar'}
          </Button.Primary>
        ) : state === 'dispatched' || state === 'dead' ? null : (
          <Button.Primary
            disabled={isPending}
            onClick={() => void restoreProtection()}
          >
            {state === 'pending'
              ? 'Restableciendo protección...'
              : 'Restablecer protección'}
          </Button.Primary>
        )}
      </Card.Actions>
    </Card.Root>
  )
}
