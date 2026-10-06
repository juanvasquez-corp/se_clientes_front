import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { Button } from './button'
import { Icon } from './icon'
import {
  ToastContext,
  type ToastContextValue,
  type ToastInput,
} from './toast-context'

type ToastVariant = 'error' | 'success'

interface ToastItem extends ToastInput {
  id: string
  variant: ToastVariant
}

interface ToastProviderProps {
  children: ReactNode
}

const VARIANT_CLASSES = {
  error: 'border-status-danger/20 bg-surface-card text-status-danger',
  success: 'border-brand-primary/20 bg-brand-soft text-brand-primary',
} as const satisfies Record<ToastVariant, string>

const VARIANT_TITLES = {
  error: 'Error',
  success: 'Éxito',
} as const satisfies Record<ToastVariant, string>

function ToastItemView({
  dismiss,
  toast,
}: {
  dismiss: (dedupeKey: string) => void
  toast: ToastItem
}) {
  const messageId = `${toast.id}-message`
  const role = toast.variant === 'error' ? 'alert' : 'status'
  const ariaLive = toast.variant === 'error' ? 'assertive' : 'polite'

  return (
    <li
      className={`grid gap-3 rounded-md border p-4 shadow-brand-floating ${VARIANT_CLASSES[toast.variant]}`}
      id={toast.id}
      data-toast={toast.variant}
    >
      <div
        className="flex items-start gap-3"
        id={messageId}
        role={role}
        aria-atomic="true"
        aria-live={ariaLive}
      >
        <Icon.Decorative name="icon-shield" />
        <div className="grid gap-1">
          <p className="font-semibold">{VARIANT_TITLES[toast.variant]}</p>
          <p>{toast.message}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button.Secondary
          aria-describedby={messageId}
          aria-label="Cerrar notificación"
          onClick={() => {
            dismiss(toast.dedupeKey)
          }}
        >
          Cerrar
        </Button.Secondary>
      </div>
    </li>
  )
}

export function ToastProvider({ children }: ToastProviderProps) {
  const providerId = useId()
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback(
    (variant: ToastVariant, input: ToastInput) => {
      const id = `${providerId}-toast-${encodeURIComponent(input.dedupeKey)}`

      setToasts((currentToasts) =>
        currentToasts.some((toast) => toast.dedupeKey === input.dedupeKey)
          ? currentToasts
          : [...currentToasts, { ...input, id, variant }],
      )
    },
    [providerId],
  )

  const showSuccess = useCallback(
    (toast: ToastInput) => {
      showToast('success', toast)
    },
    [showToast],
  )
  const showError = useCallback(
    (toast: ToastInput) => {
      showToast('error', toast)
    },
    [showToast],
  )
  const dismiss = useCallback((dedupeKey: string) => {
    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.dedupeKey !== dedupeKey),
    )
  }, [])
  const contextValue = useMemo<ToastContextValue>(
    () => ({ dismiss, showError, showSuccess }),
    [dismiss, showError, showSuccess],
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.length > 0 ? (
        <ol
          className="fixed inset-x-4 top-4 z-50 grid gap-3 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm"
          aria-label="Notificaciones"
        >
          {toasts.map((toast) => (
            <ToastItemView key={toast.dedupeKey} toast={toast} dismiss={dismiss} />
          ))}
        </ol>
      ) : null}
    </ToastContext.Provider>
  )
}
