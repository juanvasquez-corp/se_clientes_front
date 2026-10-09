import { RouterProvider } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import type { AppRouter } from './router/router'
import type { AppRuntime } from './session-runtime'

export interface AppProps {
  readonly router: AppRouter
  readonly runtime: AppRuntime
}

export function App({ router, runtime }: AppProps) {
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) runtime.close()
      })
    }
  }, [runtime])

  return <RouterProvider router={router} />
}
