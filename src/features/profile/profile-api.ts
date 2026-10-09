import { userResponseSchema, type UserResponse } from '../../contracts/schemas/user'
import type {
  ApiClient,
  MutationOutcome,
  ReadOutcome,
} from '../../core/http/api-client'
import { buildProfileUpdate } from './profile-form-schema'

const PROFILE_TARGET = '/users/me'
const PROFILE_UPDATE_KEYS = ['name', 'last_name', 'phone_number', 'email'] as const

export interface ProfileApiConfig {
  readonly apiClient: Pick<ApiClient, 'read' | 'mutate'>
}

export interface ProfileApi {
  readonly get: (signal?: AbortSignal) => Promise<ReadOutcome<UserResponse>>
  readonly update: (
    values: unknown,
    signal?: AbortSignal,
  ) => Promise<MutationOutcome<UserResponse>>
}

export function createProfileApi(config: ProfileApiConfig): ProfileApi {
  return {
    get(signal) {
      return config.apiClient.read({
        target: PROFILE_TARGET,
        schema: userResponseSchema,
        signal,
      })
    },
    update(values, signal) {
      const profileUpdate = buildProfileUpdate(values)
      const source = {
        name: profileUpdate.name,
        last_name: profileUpdate.last_name,
        phone_number: profileUpdate.phone_number,
        email: profileUpdate.email,
      }
      return config.apiClient.mutate({
        method: 'PUT',
        target: PROFILE_TARGET,
        source,
        allowedKeys: PROFILE_UPDATE_KEYS,
        schema: userResponseSchema,
        signal,
      })
    },
  }
}
