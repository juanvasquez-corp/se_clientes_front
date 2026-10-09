import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import type {
  LogoutController,
  LogoutResult,
} from '../../features/auth/logout-controller'
import { LogoutDialog } from '../../features/auth/logout-dialog'
import '../../styles/app.css'

declare global {
  interface Window {
    __logoutFixtureRequests?: () => number
  }
}

const rootElement = document.getElementById('fixture-root')
if (!rootElement) {
  throw new Error('No se encontró el elemento raíz del fixture de logout.')
}

const scenario = new URLSearchParams(window.location.search).get('scenario')
let requests = 0

function finish(result: LogoutResult, destination?: '/login' | '/forbidden') {
  if (destination !== undefined) {
    window.history.replaceState(null, '', destination)
  }
  return result
}

const controller: LogoutController = {
  async logout() {
    requests += 1
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (scenario === 'unavailable' && requests === 1) {
      return { kind: 'unavailable' }
    }
    if (scenario === 'blocked') {
      return finish({ kind: 'blocked' }, '/forbidden')
    }
    if (scenario === '401') {
      return finish({ kind: 'local-session-ended' }, '/login')
    }
    return finish({ kind: 'logged-out' }, '/login')
  },
}

window.__logoutFixtureRequests = () => requests

createRoot(rootElement).render(
  <StrictMode>
    <main className="min-h-screen bg-surface-page p-6 text-text-primary">
      <section className="mx-auto grid max-w-3xl gap-6 rounded-sm border border-border-default bg-surface-card p-6 shadow-brand-card">
        <div>
          <h1 className="text-2xl font-semibold text-brand-heading">
            Sesión de usuario
          </h1>
          <p className="mt-2 text-text-secondary">
            Fixture visual no productivo del flujo de cierre de sesión.
          </p>
        </div>
        <LogoutDialog controller={controller} />
      </section>
    </main>
  </StrictMode>,
)
