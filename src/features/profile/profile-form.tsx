import { zodResolver } from '@hookform/resolvers/zod'
import {
  useCallback,
  useImperativeHandle,
  type BaseSyntheticEvent,
  type Ref,
} from 'react'
import { useForm, type FieldError } from 'react-hook-form'
import type { z } from 'zod'

import type { UserResponse } from '../../contracts/schemas/user'
import { Badge } from '../../shared/ui/badge'
import { Alert } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'
import { Card } from '../../shared/ui/card'
import { FormField } from '../../shared/ui/form-field'
import {
  rolePresentation,
  statusPresentation,
} from '../../shared/utils/presentation'
import {
  buildProfileUpdate,
  profileFormSchema,
  type ProfileUpdate,
} from './profile-form-schema'
import { profileModeForRole } from './profile-mode'

interface FieldValidation {
  readonly message: string
  readonly status: 'error'
}

export interface ProfileFormController {
  readonly reset: (profile: UserResponse) => void
  readonly setServerErrors: (
    errors: Partial<Record<keyof ProfileUpdate, string>>,
  ) => void
  readonly submit: () => void
}

export interface ProfileFormInteraction {
  readonly cancel: () => void
  readonly state: 'idle' | 'pending'
}

interface ProfileFormProps {
  readonly controllerRef?: Ref<ProfileFormController>
  readonly interaction: ProfileFormInteraction
  readonly onSubmit: (payload: ProfileUpdate) => void | Promise<void>
  readonly profile: UserResponse
}

function fieldValidation(
  issue: FieldError | undefined,
  fallbackMessage: string,
): FieldValidation | undefined {
  if (issue === undefined) return undefined

  return {
    message:
      issue.type === 'server' && issue.message !== undefined
        ? issue.message
        : fallbackMessage,
    status: 'error',
  }
}

const PROFILE_FIELD_ORDER = [
  'name',
  'last_name',
  'phone_number',
  'email',
] as const satisfies readonly (keyof ProfileUpdate)[]

function profileDefaultValues(profile: UserResponse): z.input<typeof profileFormSchema> {
  return {
    name: profile.name,
    last_name: profile.last_name ?? '',
    phone_number: profile.phone_number ?? '',
    email: profile.email,
  }
}

function EditableProfileForm({
  controllerRef,
  interaction,
  onSubmit,
  profile,
}: ProfileFormProps) {
  const role = rolePresentation(profile.role)
  const status = statusPresentation(profile.is_active)
  const isPending = interaction.state === 'pending'
  const {
    formState: { errors },
    clearErrors,
    handleSubmit,
    register,
    reset,
    setError,
    setFocus,
  } = useForm<
    z.input<typeof profileFormSchema>,
    unknown,
    z.output<typeof profileFormSchema>
  >({
    defaultValues: profileDefaultValues(profile),
    resolver: zodResolver(profileFormSchema),
    shouldFocusError: true,
  })

  const handleValidSubmit = useCallback(
    async (values: z.output<typeof profileFormSchema>): Promise<void> => {
      await onSubmit(buildProfileUpdate(values))
    },
    [onSubmit],
  )

  const submitForm = (event: BaseSyntheticEvent) => {
    void handleSubmit(handleValidSubmit)(event)
  }

  useImperativeHandle(
    controllerRef,
    () => ({
      reset(confirmedProfile) {
        reset(profileDefaultValues(confirmedProfile))
      },
      setServerErrors(serverErrors) {
        clearErrors()
        let firstField: keyof ProfileUpdate | undefined
        for (const field of PROFILE_FIELD_ORDER) {
          const message = serverErrors[field]
          if (message === undefined) continue

          firstField ??= field
          setError(field, { message, type: 'server' })
        }
        if (firstField !== undefined) {
          queueMicrotask(() => {
            setFocus(firstField)
          })
        }
      },
      submit() {
        void handleSubmit(handleValidSubmit)()
      },
    }),
    [clearErrors, handleSubmit, handleValidSubmit, reset, setError, setFocus],
  )

  return (
    <form
      aria-busy={isPending}
      aria-label="Editar perfil"
      noValidate
      onSubmit={submitForm}
      role="form"
    >
      <Card.Root>
        <Card.Header>
          <Card.Title level={2}>Información personal</Card.Title>
          <Card.Description>Actualiza la información básica de tu cuenta.</Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="grid gap-6">
            <dl
              className="flex flex-wrap gap-x-8 gap-y-3 rounded-sm bg-surface-page p-4"
              aria-label="Información no editable"
            >
              <div className="grid gap-1">
                <dt className="text-sm font-medium text-text-secondary">Rol</dt>
                <dd>
                  <Badge variant={role.variant}>{role.label}</Badge>
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-sm font-medium text-text-secondary">Estado</dt>
                <dd>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </dd>
              </div>
            </dl>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="profile-name"
                label="Nombre"
                requirement="required"
                validation={fieldValidation(
                  errors.name,
                  'Ingresa un nombre de 1 a 50 caracteres.',
                )}
                control={
                  <input
                    type="text"
                    autoComplete="name"
                    disabled={isPending}
                    {...register('name')}
                  />
                }
              />
              <FormField
                id="profile-last-name"
                label="Apellido"
                validation={fieldValidation(
                  errors.last_name,
                  'El apellido debe tener entre 1 y 50 caracteres.',
                )}
                control={
                  <input
                    type="text"
                    autoComplete="family-name"
                    disabled={isPending}
                    {...register('last_name')}
                  />
                }
              />
              <FormField
                id="profile-phone-number"
                label="Teléfono"
                validation={fieldValidation(
                  errors.phone_number,
                  'El teléfono debe tener entre 7 y 20 caracteres.',
                )}
                control={
                  <input
                    type="tel"
                    autoComplete="tel"
                    disabled={isPending}
                    inputMode="tel"
                    {...register('phone_number')}
                  />
                }
              />
              <FormField
                id="profile-email"
                label="Correo electrónico"
                requirement="required"
                validation={fieldValidation(
                  errors.email,
                  'Ingresa un correo electrónico válido.',
                )}
                control={
                  <input
                    type="email"
                    autoComplete="email"
                    disabled={isPending}
                    inputMode="email"
                    {...register('email')}
                  />
                }
              />
            </div>
            {isPending ? (
              <Alert.Information announcement="dynamic" title="Guardando cambios">
                Guardando tus cambios.
              </Alert.Information>
            ) : null}
          </div>
        </Card.Content>
        <Card.Actions>
          <Button.Secondary
            disabled={isPending}
            onClick={interaction.cancel}
          >
            Cancelar
          </Button.Secondary>
          <Button.Primary type="submit" disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button.Primary>
        </Card.Actions>
      </Card.Root>
    </form>
  )
}

export function ProfileForm(props: ProfileFormProps) {
  if (profileModeForRole(props.profile.role) === 'readonly') return null

  return <EditableProfileForm {...props} />
}
