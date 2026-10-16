import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useStore } from 'zustand/react'

import type { UserResponse } from '../../contracts/schemas/user'
import { ApiError } from '../../core/http/errors'
import { mapValidationIssues } from '../../core/http/validation-errors'
import type { SessionIdentity } from '../../core/session/session-store'
import type { SessionStore } from '../../core/session/session-store'
import { Alert } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'
import { useToast } from '../../shared/ui/toast-context'
import type { ProfileApi } from './profile-api'
import { ProfileContent } from './profile-content'
import {
  ProfileForm,
  type ProfileFormController,
} from './profile-form'
import type { ProfileUpdate } from './profile-form-schema'
import { profileQueryKey } from './profile-query'

interface ProfileUpdateWorkflowProps {
  readonly navigate: (
    destination: '/forbidden' | '/login' | '/unavailable',
  ) => void
  readonly profile: UserResponse
  readonly profileApi: Pick<ProfileApi, 'update'>
  readonly sessionStore: SessionStore
}

type WorkflowFeedback =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'confirmation' }
  | { readonly kind: 'conflict'; readonly explanation: string }
  | { readonly kind: 'validation' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'technical'; readonly retry: 'manual' | 'none' }

interface AccountWorkflowState {
  readonly accountUuid: string
  readonly feedback: WorkflowFeedback
}

interface ConfirmedProfileState {
  readonly accountUuid: string
  readonly profile: UserResponse
}

interface MutationVariables {
  readonly payload: ProfileUpdate
  readonly signal: AbortSignal
}

const PROFILE_UPDATE_FIELDS = [
  'name',
  'last_name',
  'phone_number',
  'email',
] as const satisfies readonly (keyof ProfileUpdate)[]

function toSessionIdentity(profile: UserResponse): SessionIdentity {
  return {
    userUuid: profile.uuid,
    name: profile.name,
    lastName: profile.last_name,
    email: profile.email,
    phoneNumber: profile.phone_number,
    role: profile.role,
    isActive: profile.is_active,
  }
}

export function ProfileUpdateWorkflow({
  navigate,
  profile,
  profileApi,
  sessionStore,
}: ProfileUpdateWorkflowProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const formController = useRef<ProfileFormController>(null)
  const activeAbortController = useRef<AbortController | undefined>(undefined)
  const requestVersion = useRef(0)
  const submitLock = useRef(false)
  const activeAccountUuid = useRef(profile.uuid)
  const sessionIsAuthenticated = useStore(
    sessionStore,
    (state) => state.status === 'authenticated',
  )
  const [confirmedState, setConfirmedState] = useState<ConfirmedProfileState>({
    accountUuid: profile.uuid,
    profile,
  })
  const [workflowState, setWorkflowState] = useState<AccountWorkflowState>({
    accountUuid: profile.uuid,
    feedback: { kind: 'idle' },
  })
  const confirmedProfile =
    confirmedState.accountUuid === profile.uuid ? confirmedState.profile : profile
  const currentFeedback =
    workflowState.accountUuid === profile.uuid
      ? workflowState.feedback
      : { kind: 'idle' as const }
  const mutation = useMutation({
    mutationFn: ({ payload, signal }: MutationVariables) =>
      profileApi.update(payload, signal),
    retry: false,
  })

  useLayoutEffect(() => {
    activeAccountUuid.current = profile.uuid
    return () => {
      requestVersion.current += 1
      submitLock.current = false
      activeAbortController.current?.abort()
      activeAbortController.current = undefined
    }
  }, [profile.uuid])

  const submit = async (payload: ProfileUpdate): Promise<void> => {
    if (submitLock.current) return

    submitLock.current = true
    const version = requestVersion.current + 1
    requestVersion.current = version
    const requestAccountUuid = profile.uuid
    const abortController = new AbortController()
    activeAbortController.current = abortController
    setWorkflowState({
      accountUuid: requestAccountUuid,
      feedback: { kind: 'pending' },
    })

    try {
      const outcome = await mutation.mutateAsync({
        payload,
        signal: abortController.signal,
      })
      if (
        requestVersion.current !== version ||
        activeAccountUuid.current !== requestAccountUuid
      ) {
        return
      }
      if (outcome.kind === 'requires-confirmation') {
        setWorkflowState({
          accountUuid: requestAccountUuid,
          feedback: { kind: 'confirmation' },
        })
        return
      }
      if (outcome.kind === 'session') {
        switch (outcome.state) {
          case 'dead':
            sessionStore.getState().markDead()
            queryClient.clear()
            navigate('/login')
            break
          case 'blocked':
            sessionStore.getState().markRefreshBlocked()
            navigate('/forbidden')
            break
          case 'unavailable':
            sessionStore.getState().markRefreshUnavailable()
            navigate('/unavailable')
            break
        }
        return
      }
      if (outcome.data.uuid !== requestAccountUuid) {
        setWorkflowState({
          accountUuid: requestAccountUuid,
          feedback: { kind: 'technical', retry: 'none' },
        })
        return
      }

      const confirmedProfile = outcome.data
      queryClient.setQueryData(profileQueryKey(requestAccountUuid), {
        kind: 'success',
        data: confirmedProfile,
      })
      sessionStore.getState().updateIdentity(toSessionIdentity(confirmedProfile))
      setConfirmedState({
        accountUuid: requestAccountUuid,
        profile: confirmedProfile,
      })
      formController.current?.reset(confirmedProfile)
      toast.showSuccess({
        dedupeKey: `profile-update-${requestAccountUuid}`,
        message: 'Cambios guardados correctamente.',
      })
      setWorkflowState({
        accountUuid: requestAccountUuid,
        feedback: { kind: 'idle' },
      })
    } catch (error: unknown) {
      if (
        requestVersion.current === version &&
        activeAccountUuid.current === requestAccountUuid
      ) {
        if (error instanceof ApiError) {
          const failure = error.failure
          if (failure.kind === 'validation') {
            const validation = mapValidationIssues(
              failure.issues,
              PROFILE_UPDATE_FIELDS,
            )
            flushSync(() => {
              setWorkflowState({
                accountUuid: requestAccountUuid,
                feedback: { kind: 'validation' },
              })
              formController.current?.setServerErrors(validation.fields)
            })
          } else if (failure.kind === 'conflict') {
            setWorkflowState({
              accountUuid: requestAccountUuid,
              feedback: {
                kind: 'conflict',
                explanation:
                  failure.explanation ??
                  'No fue posible guardar porque los datos entran en conflicto.',
              },
            })
          } else if (failure.kind === 'unavailable') {
            setWorkflowState({
              accountUuid: requestAccountUuid,
              feedback: { kind: 'unavailable' },
            })
          } else if (failure.kind === 'forbidden') {
            navigate('/forbidden')
          } else {
            setWorkflowState({
              accountUuid: requestAccountUuid,
              feedback: { kind: 'technical', retry: failure.retry },
            })
          }
        } else {
          setWorkflowState({
            accountUuid: requestAccountUuid,
            feedback: { kind: 'technical', retry: 'manual' },
          })
        }
      }
    } finally {
      if (requestVersion.current === version) {
        submitLock.current = false
        activeAbortController.current = undefined
      }
    }
  }

  const cancel = () => {
    if (submitLock.current || currentFeedback.kind === 'pending') return

    mutation.reset()
    setWorkflowState({
      accountUuid: profile.uuid,
      feedback: { kind: 'idle' },
    })
    formController.current?.reset(confirmedProfile)
  }

  const retry = () => {
    formController.current?.submit()
  }

  if (!sessionIsAuthenticated) return null

  let feedbackContent = null
  switch (currentFeedback.kind) {
    case 'idle':
    case 'pending':
      break
    case 'confirmation':
      feedbackContent = (
        <Alert.Information announcement="dynamic" title="Sesión renovada">
          Tu sesión fue renovada. Confirma para guardar.
        </Alert.Information>
      )
      break
    case 'conflict':
      feedbackContent = (
        <Alert.Error announcement="dynamic" title="No pudimos guardar los cambios">
          {currentFeedback.explanation}
        </Alert.Error>
      )
      break
    case 'validation':
      feedbackContent = (
        <Alert.Error announcement="dynamic" title="Revisa la información">
          Revisa los campos señalados y vuelve a intentar.
        </Alert.Error>
      )
      break
    case 'unavailable':
      feedbackContent = (
        <div className="grid gap-3">
          <Alert.Error announcement="dynamic" title="Servicio no disponible">
            El servicio no está disponible.
          </Alert.Error>
          <div>
            <Button.Secondary onClick={retry}>Reintentar guardado</Button.Secondary>
          </div>
        </div>
      )
      break
    case 'technical':
      feedbackContent = (
        <div className="grid gap-3">
          <Alert.Error announcement="dynamic" title="Error técnico">
            No fue posible guardar los cambios de forma segura.
          </Alert.Error>
          {currentFeedback.retry === 'manual' ? (
            <div>
              <Button.Secondary onClick={retry}>Reintentar guardado</Button.Secondary>
            </div>
          ) : null}
        </div>
      )
      break
  }

  const editableContent = (
    <div className="grid gap-4">
      {feedbackContent}
      <ProfileForm
        key={profile.uuid}
        controllerRef={formController}
        interaction={{
          cancel,
          state: currentFeedback.kind === 'pending' ? 'pending' : 'idle',
        }}
        onSubmit={submit}
        profile={confirmedProfile}
      />
    </div>
  )

  return <ProfileContent profile={confirmedProfile} editableContent={editableContent} />
}
