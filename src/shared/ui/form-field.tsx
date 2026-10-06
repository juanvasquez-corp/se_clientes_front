import { cloneElement, type ReactElement } from 'react'

type FieldRequirement = 'optional' | 'required'

interface FieldValidationError {
  message: string
  status: 'error'
}

interface FieldControlProps {
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true'
  className?: string
  id?: string
  required?: boolean
}

interface FormFieldProps {
  control: ReactElement<FieldControlProps>
  help?: string
  id: string
  label: string
  requirement?: FieldRequirement
  validation?: FieldValidationError
}

const CONTROL_CLASSES =
  'min-h-11 w-full rounded-sm border border-border-default bg-surface-card px-3 py-2 text-text-primary placeholder:text-text-secondary disabled:cursor-not-allowed disabled:bg-surface-page disabled:text-text-muted aria-invalid:border-status-danger'

export function FormField({
  control,
  help,
  id,
  label,
  requirement = 'optional',
  validation,
}: FormFieldProps) {
  const controlId = `${id}-control`
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const isInvalid = validation?.status === 'error'
  const describedBy = [
    control.props['aria-describedby'],
    help ? helpId : undefined,
    isInvalid ? errorId : undefined,
  ]
    .filter((descriptionId) => Boolean(descriptionId))
    .join(' ')
  const controlClassName = [CONTROL_CLASSES, control.props.className]
    .filter((className) => Boolean(className))
    .join(' ')

  return (
    <div className="grid gap-2">
      <label className="font-semibold text-text-primary" htmlFor={controlId}>
        {label}
        {requirement === 'required' ? (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        ) : null}
      </label>
      {cloneElement(control, {
        'aria-describedby': describedBy || undefined,
        'aria-invalid': isInvalid ? true : undefined,
        className: controlClassName,
        id: controlId,
        required: requirement === 'required',
      })}
      {help ? (
        <p className="text-sm text-text-secondary" id={helpId}>
          {help}
        </p>
      ) : null}
      {isInvalid ? (
        <p
          className="text-sm font-medium text-status-danger"
          id={errorId}
          aria-live="polite"
        >
          {validation.message}
        </p>
      ) : null}
    </div>
  )
}
