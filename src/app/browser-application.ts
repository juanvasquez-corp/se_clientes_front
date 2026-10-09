import type { QueryClient } from '@tanstack/react-query'

import { createAppRouter, type AppRouter } from './router/router'
import type { AppRouterContext } from './router/router-context'
import {
  createBrowserSessionRuntime,
  type AppRuntime,
} from './session-runtime'

export interface BrowserApplication {
  readonly router: AppRouter
  readonly runtime: AppRuntime
}

export interface BrowserApplicationConfig {
  readonly apiBaseUrl: string
  readonly browserWindow: Window
  readonly queryClient: QueryClient
}

export function createBrowserApplication(
  config: BrowserApplicationConfig,
): BrowserApplication {
  const runtime = createBrowserSessionRuntime(config)
  const context: AppRouterContext = {
    queryClient: config.queryClient,
    session: {
      store: runtime.sessionStore,
      coordinator: runtime.coordinator,
      login: runtime.login,
      logoutController: runtime.logoutController,
      createSecurityRecoveryController: runtime.createSecurityRecoveryController,
    },
  }
  return {
    runtime,
    router: createAppRouter({ context }),
  }
}
