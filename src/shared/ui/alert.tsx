import { Icon } from './icon'

type AlertAnnouncement = 'dynamic' | 'static'
type AlertVariant = 'error' | 'information' | 'success'

const VARIANT_CLASSES = {
  error:
    'border-status-danger/20 bg-surface-card text-status-danger',
  information: 'border-brand-link/20 bg-brand-info text-brand-heading',
  success: 'border-brand-primary/20 bg-brand-soft text-brand-primary',
} as const satisfies Record<AlertVariant, string>

const VARIANT_TITLES = {
  error: 'Error',
  information: 'Información',
  success: 'Éxito',
} as const satisfies Record<AlertVariant, string>

interface AlertProps {
  announcement?: AlertAnnouncement
  children: string
  title?: string
}

interface AlertBoxProps extends AlertProps {
  variant: AlertVariant
}

function AlertBox({
  announcement = 'static',
  children,
  title,
  variant,
}: AlertBoxProps) {
  const role =
    announcement === 'dynamic'
      ? variant === 'error'
        ? 'alert'
        : 'status'
      : undefined

  return (
    <div
      className={`flex items-start gap-3 rounded-sm border p-4 ${VARIANT_CLASSES[variant]}`}
      data-variant={variant}
      role={role}
    >
      {variant === 'information' ? (
        <Icon.Decorative name="icon-shield" />
      ) : null}
      <div className="grid gap-1">
        <p className="font-semibold">{title ?? VARIANT_TITLES[variant]}</p>
        <p>{children}</p>
      </div>
    </div>
  )
}

function InformationAlert(props: AlertProps) {
  return <AlertBox variant="information" {...props} />
}

function SuccessAlert(props: AlertProps) {
  return <AlertBox variant="success" {...props} />
}

function ErrorAlert(props: AlertProps) {
  return <AlertBox variant="error" {...props} />
}

export const Alert = {
  Error: ErrorAlert,
  Information: InformationAlert,
  Success: SuccessAlert,
} as const
