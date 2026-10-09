import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'

import type { UserResponse } from '../../contracts/schemas/user'
import type { SessionIdentity } from '../../core/session/session-store'
import type { SessionStore } from '../../core/session/session-store'
import { Alert } from '../../shared/ui/alert'
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
  readonly profile: UserResponse
  readonly profileApi: Pick<ProfileApi, 'update'>
  readonly sessionStore: SessionStore
}

type WorkflowState = 'error' | 'idle' | 'pending'

interface AccountWorkflowState {
  readonly accountUuid: string
  readonly state: WorkflowState
}

interface ConfirmedProfileState {
  readonly accountUuid: string
  readonly profile: UserResponse
}

interface MutationVariables {
  readonly payload: ProfileUpdate
  readonly signal: AbortSignal
}

function toSessionIdentity(profile: UserResponse): SessionIdentity {
  return {
    userUuid: profile.uuid,
    name: profile.name,
    lastName: profile.last_name,
    email: profile.email,
    phoneNumber: profile.phone_number,
    role: profile.rol,
    isActive: profile.is_active,
  }
}

export function ProfileUpdateWorkflow({
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
  const [confirmedState, setConfirmedState] = useState<ConfirmedProfileState>({
    accountUuid: profile.uuid,
    profile,
  })
  const [workflowState, setWorkflowState] = useState<AccountWorkflowState>({
    accountUuid: profile.uuid,
    state: 'idle',
  })
  const confirmedProfile =
    confirmedState.accountUuid === profile.uuid ? confirmedState.profile : profile
  const currentWorkflowState =
    workflowState.accountUuid === profile.uuid ? workflowState.state : 'idle'
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
    setWorkflowState({ accountUuid: requestAccountUuid, state: 'pending' })

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
      if (outcome.kind !== 'success' || outcome.data.uuid !== requestAccountUuid) {
        setWorkflowState({ accountUuid: requestAccountUuid, state: 'error' })
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
      setWorkflowState({ accountUuid: requestAccountUuid, state: 'idle' })
    } catch {
      if (
        requestVersion.current === version &&
        activeAccountUuid.current === requestAccountUuid
      ) {
        setWorkflowState({ accountUuid: requestAccountUuid, state: 'error' })
      }
    } finally {
      if (requestVersion.current === version) {
        submitLock.current = false
        activeAbortController.current = undefined
      }
    }
  }

  const cancel = () => {
    if (submitLock.current || currentWorkflowState === 'pending') return

    mutation.reset()
    setWorkflowState({ accountUuid: profile.uuid, state: 'idle' })
    formController.current?.reset(confirmedProfile)
  }

  const editableContent = (
    <div className="grid gap-4">
      {currentWorkflowState === 'error' ? (
        <Alert.Error announcement="dynamic" title="No pudimos guardar los cambios">
          Tus cambios siguen disponibles. Intenta nuevamente.
        </Alert.Error>
      ) : null}
      <ProfileForm
        key={profile.uuid}
        controllerRef={formController}
        interaction={{
          cancel,
          state: currentWorkflowState === 'pending' ? 'pending' : 'idle',
        }}
        onSubmit={submit}
        profile={confirmedProfile}
      />
    </div>
  )

  return <ProfileContent profile={confirmedProfile} editableContent={editableContent} />
}
