export const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173'
export const DEFAULT_API_BASE_URL = 'http://localhost:8000/api'

interface E2EOriginSource {
  readonly E2E_API_BASE_URL?: string
  readonly E2E_FRONTEND_ORIGIN?: string
}

export interface E2EOrigins {
  readonly apiBaseUrl: string
  readonly frontendOrigin: string
}

export function resolveE2EOrigins(source: E2EOriginSource): E2EOrigins {
  const frontendOrigin = source.E2E_FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN
  const apiBaseUrl = source.E2E_API_BASE_URL ?? DEFAULT_API_BASE_URL

  if (new URL(frontendOrigin).hostname !== new URL(apiBaseUrl).hostname) {
    throw new Error('El frontend y la API E2E deben usar el mismo hostname.')
  }

  return { apiBaseUrl, frontendOrigin }
}
