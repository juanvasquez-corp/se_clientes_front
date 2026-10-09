import { createRouter, type RouterHistory } from '@tanstack/react-router'

import { routeTree } from './route-tree'
import { RouterPendingState } from './route-placeholders'
import type { AppRouterContext } from './router-context'

export interface CreateAppRouterOptions {
  readonly context: AppRouterContext
  readonly history?: RouterHistory
}

export function createAppRouter({ context, history }: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    context,
    defaultPendingComponent: RouterPendingState,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    ...(history === undefined ? {} : { history }),
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
