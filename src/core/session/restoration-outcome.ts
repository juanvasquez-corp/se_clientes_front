export type RestorationStep = 'csrf' | 'refresh' | 'profile'
export type RestorationFailure =
  | 'success'
  | 'unauthorized'
  | 'forbidden'
  | 'unavailable'
  | 'technical'

export type RestorationOutcome =
  | { readonly kind: 'continue' }
  | { readonly kind: 'dead'; readonly destination: '/login' }
  | {
      readonly kind: 'forbidden-access'
      readonly destination: '/forbidden'
    }
  | {
      readonly kind: 'blocked-security'
      readonly destination: '/forbidden'
    }
  | {
      readonly kind: 'unavailable'
      readonly destination: '/unavailable'
      readonly retry: 'manual'
    }

export function restorationOutcome(
  step: RestorationStep,
  failure: RestorationFailure,
): RestorationOutcome {
  switch (failure) {
    case 'success':
      return { kind: 'continue' }
    case 'unauthorized':
      return { kind: 'dead', destination: '/login' }
    case 'forbidden':
      return step === 'refresh'
        ? { kind: 'blocked-security', destination: '/forbidden' }
        : { kind: 'forbidden-access', destination: '/forbidden' }
    case 'unavailable':
    case 'technical':
      return {
        kind: 'unavailable',
        destination: '/unavailable',
        retry: 'manual',
      }
  }
}
