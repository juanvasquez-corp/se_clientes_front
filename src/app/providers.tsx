import type { ReactNode } from 'react'
import {
  QueryClientProvider,
  type QueryClient,
} from '@tanstack/react-query'

interface AppProvidersProps {
  children: ReactNode
  queryClient: QueryClient
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
