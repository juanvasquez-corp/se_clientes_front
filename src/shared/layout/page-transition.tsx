import { ViewTransition, type ReactNode } from 'react'

export function PageTransition({ children }: { readonly children: ReactNode }) {
  return <ViewTransition default="none">{children}</ViewTransition>
}
