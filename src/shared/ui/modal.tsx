import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { Alert } from './alert'
import { Button } from './button'
import { Card } from './card'

export type ModalInteractionState = 'idle' | 'pending'

interface ModalRootProps {
  children: ReactNode
  interactionState: ModalInteractionState
  onOpenChange: (open: boolean) => void
  open: boolean
}

interface ModalStateContextValue {
  descriptionId: string
  interactionState: ModalInteractionState
  open: boolean
  titleId: string
}

interface ModalActionsContextValue {
  notifyNativeClose: () => void
  openFrom: (origin: HTMLElement) => void
  requestClose: () => void
}

type DialogRegistration = (dialog: HTMLDialogElement | null) => void

const ModalStateContext = createContext<ModalStateContextValue | null>(null)
const ModalActionsContext = createContext<ModalActionsContextValue | null>(null)
const ModalDialogRegistrationContext = createContext<DialogRegistration | null>(null)

function useModalState(): ModalStateContextValue {
  const context = useContext(ModalStateContext)

  if (!context) {
    throw new Error('Los componentes Modal deben utilizarse dentro de Modal.Root.')
  }

  return context
}

function useModalActions(): ModalActionsContextValue {
  const context = useContext(ModalActionsContext)

  if (!context) {
    throw new Error('Los componentes Modal deben utilizarse dentro de Modal.Root.')
  }

  return context
}

function useDialogRegistration(): DialogRegistration {
  const registration = useContext(ModalDialogRegistrationContext)

  if (!registration) {
    throw new Error('Modal.Content debe utilizarse dentro de Modal.Root.')
  }

  return registration
}

function openDialog(dialog: HTMLDialogElement) {
  if (dialog.open) {
    return
  }

  if (typeof dialog.showModal === 'function') {
    dialog.showModal()
  } else {
    dialog.setAttribute('open', '')
  }
}

function closeDialog(dialog: HTMLDialogElement) {
  if (!dialog.open) {
    return
  }

  if (typeof dialog.close === 'function') {
    dialog.close()
  } else {
    dialog.removeAttribute('open')
  }
}

function ModalRoot({
  children,
  interactionState,
  onOpenChange,
  open,
}: ModalRootProps) {
  const generatedId = useId()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const originRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const titleId = `${generatedId}-title`
  const descriptionId = `${generatedId}-description`

  const openFrom = useCallback(
    (origin: HTMLElement) => {
      originRef.current = origin
      onOpenChange(true)
    },
    [onOpenChange],
  )
  const requestClose = useCallback(() => {
    if (interactionState === 'idle') {
      onOpenChange(false)
    }
  }, [interactionState, onOpenChange])
  const notifyNativeClose = useCallback(() => {
    if (open) {
      onOpenChange(false)
    }
  }, [onOpenChange, open])
  const registerDialog = useCallback((dialog: HTMLDialogElement | null) => {
    dialogRef.current = dialog
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    let focusFrame: number | undefined

    if (!dialog) {
      return
    }

    if (open) {
      openDialog(dialog)

      if (interactionState === 'pending') {
        focusFrame = requestAnimationFrame(() => {
          if (dialog.open && dialog.isConnected) {
            dialog.querySelector<HTMLElement>('[data-modal-initial-focus]')?.focus()
          }
        })
      } else if (!dialog.contains(document.activeElement)) {
        dialog.querySelector<HTMLElement>('[data-modal-initial-focus]')?.focus()
      }
    } else {
      closeDialog(dialog)

      if (wasOpenRef.current) {
        const origin = originRef.current
        originRef.current = null

        if (origin?.isConnected) {
          origin.focus()
        }
      }
    }

    wasOpenRef.current = open

    return () => {
      if (focusFrame !== undefined) {
        cancelAnimationFrame(focusFrame)
      }
    }
  }, [interactionState, open])

  useEffect(
    () => () => {
      const dialog = dialogRef.current

      if (dialog) {
        closeDialog(dialog)
      }
    },
    [],
  )

  const stateValue = useMemo<ModalStateContextValue>(
    () => ({
      descriptionId,
      interactionState,
      open,
      titleId,
    }),
    [descriptionId, interactionState, open, titleId],
  )
  const actionsValue = useMemo<ModalActionsContextValue>(
    () => ({ notifyNativeClose, openFrom, requestClose }),
    [notifyNativeClose, openFrom, requestClose],
  )

  return (
    <ModalStateContext.Provider value={stateValue}>
      <ModalActionsContext.Provider value={actionsValue}>
        <ModalDialogRegistrationContext.Provider value={registerDialog}>
          {children}
        </ModalDialogRegistrationContext.Provider>
      </ModalActionsContext.Provider>
    </ModalStateContext.Provider>
  )
}

interface ModalTriggerProps {
  children: string
  variant: 'destructive' | 'primary' | 'secondary'
}

function ModalTrigger({ children, variant }: ModalTriggerProps) {
  const { openFrom } = useModalActions()
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    openFrom(event.currentTarget)
  }

  if (variant === 'destructive') {
    return <Button.Destructive onClick={handleClick}>{children}</Button.Destructive>
  }

  if (variant === 'primary') {
    return <Button.Primary onClick={handleClick}>{children}</Button.Primary>
  }

  return <Button.Secondary onClick={handleClick}>{children}</Button.Secondary>
}

interface ModalContentProps {
  children: ReactNode
  description: string
  title: string
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function ModalContent({ children, description, title }: ModalContentProps) {
  const state = useModalState()
  const actions = useModalActions()
  const registerDialog = useDialogRegistration()
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      actions.requestClose()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const dialog = event.currentTarget
    const focusableElements = [
      ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ]
    const firstElement = focusableElements[0]
    const lastElement = focusableElements.at(-1)

    if (!firstElement || !lastElement) {
      event.preventDefault()
      dialog.querySelector<HTMLElement>('[data-modal-initial-focus]')?.focus()
      return
    }

    if (
      event.shiftKey &&
      (document.activeElement === firstElement ||
        document.activeElement ===
          dialog.querySelector<HTMLElement>('[data-modal-initial-focus]'))
    ) {
      event.preventDefault()
      lastElement.focus()
    } else if (
      !event.shiftKey &&
      (document.activeElement === lastElement ||
        !dialog.contains(document.activeElement))
    ) {
      event.preventDefault()
      firstElement.focus()
    }
  }
  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    actions.requestClose()
  }
  const handleClose = () => {
    actions.notifyNativeClose()
  }

  return (
    <dialog
      ref={registerDialog}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto border-0 bg-transparent p-0 text-text-primary backdrop:bg-brand-strong/60"
      aria-describedby={state.descriptionId}
      aria-labelledby={state.titleId}
      aria-modal="true"
      onCancel={handleCancel}
      onClose={handleClose}
      onKeyDown={handleKeyDown}
    >
      <Card.Root>
        <Card.Header>
          <h2
            className="font-semibold text-brand-heading"
            id={state.titleId}
            tabIndex={-1}
            data-modal-initial-focus
          >
            {title}
          </h2>
          <p className="text-text-secondary" id={state.descriptionId}>
            {description}
          </p>
        </Card.Header>
        <Card.Content>
          <div className="grid gap-4">{children}</div>
        </Card.Content>
      </Card.Root>
    </dialog>
  )
}

function ModalActions({ children }: { children: ReactNode }) {
  return <Card.Actions>{children}</Card.Actions>
}

function ModalError({ children }: { children: string }) {
  return <Alert.Error announcement="dynamic">{children}</Alert.Error>
}

function ModalCancel({ children }: { children: string }) {
  const { interactionState } = useModalState()
  const { requestClose } = useModalActions()

  return (
    <Button.Secondary
      disabled={interactionState === 'pending'}
      onClick={requestClose}
    >
      {children}
    </Button.Secondary>
  )
}

interface ModalConfirmProps {
  children: string
  onConfirm: () => void
  pendingLabel: string
  variant: 'destructive' | 'primary'
}

function ModalConfirm({
  children,
  onConfirm,
  pendingLabel,
  variant,
}: ModalConfirmProps) {
  const { interactionState } = useModalState()
  const isPending = interactionState === 'pending'
  const handleConfirm = () => {
    if (!isPending) {
      onConfirm()
    }
  }
  const label = isPending ? pendingLabel : children

  return variant === 'destructive' ? (
    <Button.Destructive disabled={isPending} onClick={handleConfirm}>
      {label}
    </Button.Destructive>
  ) : (
    <Button.Primary disabled={isPending} onClick={handleConfirm}>
      {label}
    </Button.Primary>
  )
}

export const Modal = {
  Actions: ModalActions,
  Cancel: ModalCancel,
  Confirm: ModalConfirm,
  Content: ModalContent,
  Error: ModalError,
  Root: ModalRoot,
  Trigger: ModalTrigger,
} as const
