import { useEffect, useRef, useState } from 'react'

import { Modal, type ModalInteractionState } from '../../shared/ui/modal'
import type { LogoutController } from './logout-controller'

export interface LogoutDialogProps {
  readonly controller: LogoutController
}

export function LogoutDialog({ controller }: LogoutDialogProps) {
  const [open, setOpen] = useState(false)
  const [interactionState, setInteractionState] =
    useState<ModalInteractionState>('idle')
  const [unavailable, setUnavailable] = useState(false)
  const attemptPending = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setInteractionState('idle')
      setUnavailable(false)
      attemptPending.current = false
    }
  }

  const confirmLogout = async () => {
    if (attemptPending.current) return
    attemptPending.current = true
    setInteractionState('pending')
    setUnavailable(false)

    const result = await controller.logout()
    if (!mounted.current) return

    attemptPending.current = false
    if (result.kind === 'unavailable') {
      setInteractionState('idle')
      setUnavailable(true)
      return
    }
    setOpen(false)
    setInteractionState('idle')
  }

  return (
    <Modal.Root
      open={open}
      onOpenChange={changeOpen}
      interactionState={interactionState}
    >
      <Modal.Trigger variant="secondary">Cerrar sesión</Modal.Trigger>
      <Modal.Content
        title="Cerrar sesión"
        description="Confirma que deseas finalizar tu sesión en este dispositivo."
      >
        <p>Podrás volver a ingresar con tus credenciales.</p>
        {unavailable ? (
          <Modal.Error>
            No pudimos cerrar la sesión. Puedes intentarlo nuevamente.
          </Modal.Error>
        ) : null}
        <Modal.Actions>
          <Modal.Cancel>Cancelar</Modal.Cancel>
          <Modal.Confirm
            variant="destructive"
            pendingLabel="Cerrando sesión..."
            onConfirm={() => {
              void confirmLogout()
            }}
          >
            {unavailable ? 'Reintentar' : 'Cerrar sesión'}
          </Modal.Confirm>
        </Modal.Actions>
      </Modal.Content>
    </Modal.Root>
  )
}
