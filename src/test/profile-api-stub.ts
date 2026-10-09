import type { ProfileApi } from '../features/profile/profile-api'

export function createProfileApiStub(): ProfileApi {
  return {
    get: () => Promise.resolve({ kind: 'session', state: 'dead' }),
    update: () => Promise.resolve({ kind: 'session', state: 'dead' }),
  }
}
