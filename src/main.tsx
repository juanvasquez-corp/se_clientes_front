import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/app'
import { AppProviders } from './app/providers'
import { createAppQueryClient } from './app/query-client'
import { parsePublicEnv } from './config/env'
import './styles/app.css'

parsePublicEnv(import.meta.env)

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.')
}

const queryClient = createAppQueryClient()

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <App />
    </AppProviders>
  </StrictMode>,
)
