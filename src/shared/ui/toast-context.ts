import { createContext, useContext } from 'react'

export interface ToastInput {
  dedupeKey: string
  message: string
}

export interface ToastContextValue {
  dismiss: (dedupeKey: string) => void
  showError: (toast: ToastInput) => void
  showSuccess: (toast: ToastInput) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast debe utilizarse dentro de ToastProvider.')
  }

  return context
}
