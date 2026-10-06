import { createElement, type ReactNode } from 'react'

interface SlotProps {
  children: ReactNode
}

interface CardTitleProps extends SlotProps {
  level: 2 | 3 | 4
}

const HEADING_ELEMENTS = {
  2: 'h2',
  3: 'h3',
  4: 'h4',
} as const

function CardRoot({ children }: SlotProps) {
  return (
    <div className="rounded-md border border-border-default bg-surface-card p-6 shadow-brand-card">
      {children}
    </div>
  )
}

function CardHeader({ children }: SlotProps) {
  return (
    <div className="grid gap-2" data-slot="header">
      {children}
    </div>
  )
}

function CardTitle({ children, level }: CardTitleProps) {
  const heading = HEADING_ELEMENTS[level]

  return createElement(
    heading,
    { className: 'font-semibold text-brand-heading' },
    children,
  )
}

function CardDescription({ children }: SlotProps) {
  return <p className="text-text-secondary">{children}</p>
}

function CardContent({ children }: SlotProps) {
  return (
    <div className="mt-6" data-slot="content">
      {children}
    </div>
  )
}

function CardActions({ children }: SlotProps) {
  return (
    <div
      className="mt-6 flex flex-wrap items-center justify-end gap-3"
      data-slot="actions"
    >
      {children}
    </div>
  )
}

export const Card = {
  Actions: CardActions,
  Content: CardContent,
  Description: CardDescription,
  Header: CardHeader,
  Root: CardRoot,
  Title: CardTitle,
} as const
