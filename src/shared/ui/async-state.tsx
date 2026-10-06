import type { ReactNode } from 'react'

import { Alert } from './alert'
import { Button } from './button'
import { Card } from './card'
import { Skeleton } from './skeleton'

export type RecoveryState = 'idle' | 'pending'

interface RecoveryAction {
  label: string
  onRetry: () => void
  state: RecoveryState
}

interface LoadingStateProps {
  label?: string
}

interface EmptyStateProps {
  action?: ReactNode
  description: string
  title: string
  titleLevel: 2 | 3 | 4
}

interface FeedbackStateProps {
  description: string
  recovery?: RecoveryAction
  title: string
}

interface FeedbackFrameProps extends FeedbackStateProps {
  variant: 'error' | 'unavailable'
}

function RecoveryButton({ label, onRetry, state }: RecoveryAction) {
  const isPending = state === 'pending'

  return (
    <Button.Secondary disabled={isPending} onClick={onRetry}>
      {isPending ? 'Reintentando...' : label}
    </Button.Secondary>
  )
}

function LoadingState({ label = 'Cargando contenido' }: LoadingStateProps) {
  return (
    <div data-state="loading">
      <Card.Root>
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">{label}</span>
          <div className="grid gap-4" aria-hidden="true">
            <div className="flex items-center gap-3">
              <Skeleton.Avatar />
              <div className="grid flex-1 gap-2">
                <Skeleton.Line width="half" />
                <Skeleton.Line width="three-quarters" />
              </div>
            </div>
            <Skeleton.Field />
            <Skeleton.Field />
          </div>
        </div>
      </Card.Root>
    </div>
  )
}

function EmptyState({
  action,
  description,
  title,
  titleLevel,
}: EmptyStateProps) {
  return (
    <div data-state="empty">
      <Card.Root>
        <Card.Header>
          <Card.Title level={titleLevel}>{title}</Card.Title>
          <Card.Description>{description}</Card.Description>
        </Card.Header>
        {action ? <Card.Actions>{action}</Card.Actions> : null}
      </Card.Root>
    </div>
  )
}

function FeedbackFrame({
  description,
  recovery,
  title,
  variant,
}: FeedbackFrameProps) {
  const feedback =
    variant === 'error' ? (
      <Alert.Error announcement="dynamic" title={title}>
        {description}
      </Alert.Error>
    ) : (
      <Alert.Information announcement="dynamic" title={title}>
        {description}
      </Alert.Information>
    )

  return (
    <div data-state={variant}>
      <Card.Root>
        {feedback}
        {recovery ? (
          <Card.Actions>
            <RecoveryButton {...recovery} />
          </Card.Actions>
        ) : null}
      </Card.Root>
    </div>
  )
}

function ErrorState(props: FeedbackStateProps) {
  return <FeedbackFrame variant="error" {...props} />
}

function UnavailableState(props: FeedbackStateProps) {
  return <FeedbackFrame variant="unavailable" {...props} />
}

export const AsyncState = {
  Empty: EmptyState,
  Error: ErrorState,
  Loading: LoadingState,
  Unavailable: UnavailableState,
} as const
