import { z } from 'zod'

export const loginInputSchema = z.strictObject(
  {
    email: z
      .string({ error: 'Ingresa un correo electrónico válido.' })
      .trim()
      .min(1, 'Ingresa tu correo electrónico.')
      .toLowerCase()
      .pipe(z.email('Ingresa un correo electrónico válido.')),
    password: z
      .string({ error: 'Ingresa una contraseña válida.' })
      .min(1, 'Ingresa tu contraseña.')
      .max(128, 'La contraseña no puede superar 128 caracteres.'),
  },
  { error: 'Las credenciales contienen campos no permitidos.' },
)

export type LoginInput = z.infer<typeof loginInputSchema>

export function normalizeLoginInput(input: unknown): LoginInput {
  return loginInputSchema.parse(input)
}
