import { zodResolver } from '@hookform/resolvers/zod'
import {
  useRef,
  useEffect,
  useState,
  type BaseSyntheticEvent,
  type ReactNode,
} from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import type { LoginOutcome } from '../../core/session/auth-api'
import { Alert } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'
import { FormField } from '../../shared/ui/form-field'
import { parseRetryAfter, remainingLockMs } from './retry-after'
import {
  loginInputSchema,
  type LoginInput,
} from './login-schema'

interface LoginFormProps {
  readonly now?: () => Date
  readonly onSubmit: (input: LoginInput) => Promise<LoginOutcome>
}

type LoginFeedback = Exclude<LoginOutcome['kind'], 'authenticated'>

const MAX_TIMEOUT_MS = 2_147_483_647

function systemNow(): Date {
  return new Date()
}

interface FieldValidation {
  message: string
  status: 'error'
}

function fieldValidation(message: string | undefined): FieldValidation | undefined {
  return message === undefined ? undefined : { message, status: 'error' }
}

function focusFeedback(element: HTMLDivElement | null): void {
  element?.focus()
}

function FocusedFeedback({ children }: { readonly children: ReactNode }) {
  return (
    <div
      ref={focusFeedback}
      aria-label="Resultado del inicio de sesión"
      role="group"
      tabIndex={-1}
    >
      {children}
    </div>
  )
}

export function LoginForm({ now = systemNow, onSubmit }: LoginFormProps) {
  const [feedback, setFeedback] = useState<LoginFeedback | undefined>()
  const [unlockAtMs, setUnlockAtMs] = useState<number | undefined>()
  const [passwordVisibility, setPasswordVisibility] = useState<'hidden' | 'visible'>(
    'hidden',
  )
  const submitLock = useRef(false)
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setFocus,
    setValue,
  } = useForm<
    z.input<typeof loginInputSchema>,
    unknown,
    z.output<typeof loginInputSchema>
  >({
    defaultValues: { email: '', psswd: '' },
    resolver: zodResolver(loginInputSchema),
    shouldFocusError: true,
  })
  const passwordIsVisible = passwordVisibility === 'visible'
  const isRateLimited = unlockAtMs !== undefined

  useEffect(() => {
    if (unlockAtMs === undefined) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const scheduleUnlock = () => {
      const remainingMs = remainingLockMs(new Date(unlockAtMs), now())
      if (remainingMs === 0) {
        setUnlockAtMs(undefined)
        setFeedback((current) =>
          current === 'rate-limited' ? undefined : current,
        )
        return
      }

      timer = setTimeout(scheduleUnlock, Math.min(remainingMs, MAX_TIMEOUT_MS))
    }

    scheduleUnlock()
    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [now, unlockAtMs])

  const handleValidSubmit = async (input: LoginInput): Promise<void> => {
    if (submitLock.current) return

    submitLock.current = true
    try {
      setFeedback(undefined)
      const outcome = await onSubmit(input)
      if (outcome.kind === 'authenticated') return

      setValue('email', input.email)
      setValue('psswd', '')
      setPasswordVisibility('hidden')
      setFeedback(outcome.kind)
      if (outcome.kind === 'rate-limited') {
        const unlockAt = parseRetryAfter(outcome.retryAfter, now())
        setUnlockAtMs(
          remainingLockMs(unlockAt, now()) === 0 ? undefined : unlockAt.getTime(),
        )
      }
    } finally {
      submitLock.current = false
    }
  }

  const togglePasswordVisibility = () => {
    setPasswordVisibility((current) =>
      current === 'hidden' ? 'visible' : 'hidden',
    )
  }

  const focusPassword = () => {
    setFocus('psswd')
  }

  const submitForm = (event: BaseSyntheticEvent) => {
    if (isRateLimited) return
    void handleSubmit(handleValidSubmit)(event)
  }

  return (
    <form
      className="grid gap-4"
      aria-busy={isSubmitting}
      aria-label="Inicio de sesión"
      noValidate
      onSubmit={submitForm}
      role="form"
    >
      <FormField
        id="login-email"
        label="Correo electrónico"
        requirement="required"
        validation={fieldValidation(errors.email?.message)}
        control={
          <input
            type="email"
            autoComplete="username"
            disabled={isRateLimited}
            inputMode="email"
            {...register('email')}
          />
        }
      />

      <div className="relative">
        <FormField
          id="login-password"
          label="Contraseña"
          requirement="required"
          validation={fieldValidation(errors.psswd?.message)}
          control={
            <input
              className="pr-14"
              type={passwordIsVisible ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={isRateLimited}
              {...register('psswd')}
            />
          }
        />
        <div className="absolute right-0 top-8">
          <Button.Icon
            aria-pressed={passwordIsVisible}
            disabled={isRateLimited}
            icon="icon-eye"
            label={
              passwordIsVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'
            }
            onClick={togglePasswordVisibility}
          />
        </div>
      </div>

      {isSubmitting ? (
        <Alert.Information announcement="dynamic" title="Ingresando">
          Validando tus credenciales.
        </Alert.Information>
      ) : null}

      {feedback === 'credentials-rejected' ? (
        <FocusedFeedback>
          <Alert.Error announcement="dynamic" title="No pudimos iniciar sesión">
            No fue posible iniciar sesión con esas credenciales.
          </Alert.Error>
        </FocusedFeedback>
      ) : null}

      {feedback === 'unavailable' ? (
        <FocusedFeedback>
          <div className="grid gap-3">
            <Alert.Error announcement="dynamic" title="Servicio no disponible">
              El servicio no está disponible. Vuelve a ingresar tu contraseña e intenta
              de nuevo.
            </Alert.Error>
            <Button.Secondary onClick={focusPassword}>
              Volver a ingresar la contraseña
            </Button.Secondary>
          </div>
        </FocusedFeedback>
      ) : null}

      {feedback === 'technical' ? (
        <FocusedFeedback>
          <Alert.Error announcement="dynamic" title="No pudimos iniciar sesión">
            No fue posible completar el inicio de sesión. Intenta de nuevo.
          </Alert.Error>
        </FocusedFeedback>
      ) : null}

      {feedback === 'rate-limited' ? (
        <FocusedFeedback>
          <Alert.Error announcement="dynamic" title="Demasiados intentos">
            {isRateLimited
              ? 'Los intentos están temporalmente limitados.'
              : 'El límite de intentos finalizó. Puedes intentarlo de nuevo.'}
          </Alert.Error>
        </FocusedFeedback>
      ) : null}

      <Button.Primary type="submit" disabled={isSubmitting || isRateLimited}>
        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </Button.Primary>
    </form>
  )
}
