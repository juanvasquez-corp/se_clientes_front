import { z } from 'zod'

const EMAIL_MAX_LENGTH = 254

export function normalizeOptionalField(value: string): string | null {
  const normalized = value.trim()
  return normalized.length === 0 ? null : normalized
}

export const nameInputSchema = z.string().trim().min(1).max(50)

const normalizedNullableTextSchema = z.union([
  z.string().transform(normalizeOptionalField),
  z.null(),
])

export const nullableNameInputSchema = normalizedNullableTextSchema.pipe(
  z.string().min(1).max(50).nullable(),
)

export const nullablePhoneInputSchema = normalizedNullableTextSchema.pipe(
  z.string().min(7).max(20).nullable(),
)

export const emailInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email())
