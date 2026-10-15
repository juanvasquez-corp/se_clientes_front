import { z } from 'zod'

export const userSearchSchema = z.strictObject(
  {
    email: z
      .string({ error: 'Ingresa un correo electrónico válido.' })
      .trim()
      .min(1, 'Ingresa tu correo electrónico.')
      .toLowerCase()
      .pipe(z.email('Ingresa un correo electrónico válido.')),
  },
  { error: 'La búsqueda contiene campos no permitidos.' },
)

export type UserSearchInput = z.infer<typeof userSearchSchema>

export function normalizeUserSearch(input: unknown): UserSearchInput {
  return userSearchSchema.parse(input)
}
