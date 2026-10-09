import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import type { SecurityRecoveryController } from '../../features/auth/security-recovery-controller'
import { SecurityRecoveryPanel } from '../../features/auth/security-recovery-panel'
import '../../styles/app.css'

declare global {
  interface Window {
    __securityFixtureState?: () => {
      recoveryRequests: number
      retryRequests: number
    }
  }
}

const rootElement = document.getElementById('fixture-root')
if (!rootElement) {
  throw new Error('No se encontró el elemento raíz del fixture de seguridad.')
}

const scenario = new URLSearchParams(window.location.search).get('scenario')
let recoveryRequests = 0
let retryRequests = 0
window.history.replaceState(null, '', '/forbidden')

const controller: SecurityRecoveryController = {
  operation: 'logout',
  async restoreProtection() {
    recoveryRequests += 1
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (scenario === 'unavailable') {
      window.history.replaceState(null, '', '/unavailable')
      return { kind: 'unavailable' }
    }
    if (scenario === 'blocked') return { kind: 'blocked' }
    return { kind: 'restored' }
  },
  async retryOriginal() {
    retryRequests += 1
    await new Promise((resolve) => setTimeout(resolve, 200))
    return { kind: 'dispatched' }
  },
}

window.__securityFixtureState = () => ({ recoveryRequests, retryRequests })

createRoot(rootElement).render(
  <StrictMode>
    <main className="min-h-screen bg-surface-page p-6 text-text-primary">
      <section className="mx-auto grid max-w-3xl gap-6">
        <h1 className="text-2xl font-semibold text-brand-heading">
          Verificación de seguridad
        </h1>
        <SecurityRecoveryPanel controller={controller} />
      </section>
    </main>
  </StrictMode>,
)
