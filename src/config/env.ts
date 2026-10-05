import { z } from 'zod'

export interface PublicEnv {
  apiBaseUrl: string
}

const invalidPublicEnvMessage =
  'La configuración pública es inválida. Configura VITE_API_BASE_URL.'

export function isAllowedApiBaseUrl(value: string): boolean {
  if (value.length === 0 || /\s/u.test(value)) {
    return false
  }

  if (value.startsWith('/')) {
    return !value.startsWith('//')
  }

  try {
    const url = new URL(value)

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username.length === 0 &&
      url.password.length === 0
    )
  } catch {
    return false
  }
}

const publicEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().trim().min(1).refine(isAllowedApiBaseUrl),
})

export function parsePublicEnv(source: Record<string, unknown>): PublicEnv {
  const result = publicEnvSchema.safeParse(source)

  if (!result.success) {
    throw new Error(invalidPublicEnvMessage)
  }

  return { apiBaseUrl: result.data.VITE_API_BASE_URL }
}
