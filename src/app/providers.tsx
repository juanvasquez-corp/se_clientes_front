import type { ReactNode } from 'react'
import {
  QueryClientProvider,
  type QueryClient,
} from '@tanstack/react-query'
import { ToastProvider } from '../shared/ui/toast-provider'

interface AppProvidersProps {
  children: ReactNode
  queryClient: QueryClient
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
