import { zodResolver } from '@hookform/resolvers/zod'
import {
  useImperativeHandle,
  type BaseSyntheticEvent,
  type Ref,
} from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import type { UserResponse } from '../../contracts/schemas/user'
import { Badge } from '../../shared/ui/badge'
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
}

interface ProfileFormProps {
  readonly controllerRef?: Ref<ProfileFormController>
  readonly onSubmit: (payload: ProfileUpdate) => void | Promise<void>
  readonly profile: UserResponse
}

function fieldValidation(
  issue: string | undefined,
  message: string,
): FieldValidation | undefined {
  return issue === undefined ? undefined : { message, status: 'error' }
}

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
  onSubmit,
  profile,
}: ProfileFormProps) {
  const role = rolePresentation(profile.rol)
  const status = statusPresentation(profile.is_active)
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<
    z.input<typeof profileFormSchema>,
    unknown,
    z.output<typeof profileFormSchema>
  >({
    defaultValues: profileDefaultValues(profile),
    resolver: zodResolver(profileFormSchema),
    shouldFocusError: true,
  })

  useImperativeHandle(
    controllerRef,
    () => ({
      reset(confirmedProfile) {
        reset(profileDefaultValues(confirmedProfile))
      },
    }),
    [reset],
  )

  const handleValidSubmit = async (
    values: z.output<typeof profileFormSchema>,
  ): Promise<void> => {
    await onSubmit(buildProfileUpdate(values))
  }

  const submitForm = (event: BaseSyntheticEvent) => {
    void handleSubmit(handleValidSubmit)(event)
  }

  return (
    <form aria-label="Editar perfil" noValidate onSubmit={submitForm} role="form">
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
                  errors.name?.message,
                  'Ingresa un nombre de 1 a 50 caracteres.',
                )}
                control={<input type="text" autoComplete="name" {...register('name')} />}
              />
              <FormField
                id="profile-last-name"
                label="Apellido"
                validation={fieldValidation(
                  errors.last_name?.message,
                  'El apellido debe tener entre 1 y 50 caracteres.',
                )}
                control={
                  <input
                    type="text"
                    autoComplete="family-name"
                    {...register('last_name')}
                  />
                }
              />
              <FormField
                id="profile-phone-number"
                label="Teléfono"
                validation={fieldValidation(
                  errors.phone_number?.message,
                  'El teléfono debe tener entre 7 y 20 caracteres.',
                )}
                control={
                  <input
                    type="tel"
                    autoComplete="tel"
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
                  errors.email?.message,
                  'Ingresa un correo electrónico válido.',
                )}
                control={
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    {...register('email')}
                  />
                }
              />
            </div>
          </div>
        </Card.Content>
        <Card.Actions>
          <Button.Primary type="submit">Guardar cambios</Button.Primary>
        </Card.Actions>
      </Card.Root>
    </form>
  )
}

export function ProfileForm(props: ProfileFormProps) {
  if (profileModeForRole(props.profile.rol) === 'readonly') return null

  return <EditableProfileForm {...props} />
}
