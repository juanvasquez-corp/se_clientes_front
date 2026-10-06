import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Icon, type IconName } from './icon'

const COMMON_CLASSES =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm font-semibold transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-60'

const TEXT_VARIANT_CLASSES = {
  primary:
    'bg-brand-primary px-5 text-surface-card hover:bg-brand-primary-hover',
  secondary:
    'border border-border-default bg-surface-card px-5 text-brand-heading hover:bg-surface-page',
  destructive:
    'bg-status-danger px-5 text-surface-card hover:bg-status-danger/90',
} as const

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'className'
>

interface TextButtonProps extends NativeButtonProps {
  children: ReactNode
}

interface IconButtonProps
  extends Omit<NativeButtonProps, 'aria-label' | 'title'> {
  icon: IconName
  label: string
}

interface TextButtonVariantProps extends TextButtonProps {
  variant: keyof typeof TEXT_VARIANT_CLASSES
}

function TextButton({ children, variant, ...buttonProps }: TextButtonVariantProps) {
  return (
    <button
      type="button"
      className={`${COMMON_CLASSES} ${TEXT_VARIANT_CLASSES[variant]}`}
      {...buttonProps}
    >
      {children}
    </button>
  )
}

function PrimaryButton(props: TextButtonProps) {
  return <TextButton variant="primary" {...props} />
}

function SecondaryButton(props: TextButtonProps) {
  return <TextButton variant="secondary" {...props} />
}

function DestructiveButton(props: TextButtonProps) {
  return <TextButton variant="destructive" {...props} />
}

function IconButton({ icon, label, ...buttonProps }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`${COMMON_CLASSES} size-11 p-0 text-brand-heading hover:bg-surface-page`}
      aria-label={label}
      title={label}
      {...buttonProps}
    >
      <Icon.Decorative name={icon} />
    </button>
  )
}

export const Button = {
  Primary: PrimaryButton,
  Secondary: SecondaryButton,
  Destructive: DestructiveButton,
  Icon: IconButton,
} as const
