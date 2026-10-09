import { z } from 'zod'

export const tokenResponseSchema = z.strictObject({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
  csrf_token: z.string().min(1),
})

export const csrfResponseSchema = z.strictObject({
  csrf_token: z.string().min(1),
})

export const messageResponseSchema = z.strictObject({
  detail: z.string(),
})

export type TokenResponse = z.infer<typeof tokenResponseSchema>
export type CsrfResponse = z.infer<typeof csrfResponseSchema>
export type MessageResponse = z.infer<typeof messageResponseSchema>
