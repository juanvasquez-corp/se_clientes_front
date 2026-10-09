import { z } from 'zod'

import {
  emailInputSchema,
  nameInputSchema,
  nullableNameInputSchema,
  nullablePhoneInputSchema,
} from '../../contracts/schemas/user-input'

export const profileFormSchema = z.strictObject({
  name: nameInputSchema,
  last_name: nullableNameInputSchema,
  phone_number: nullablePhoneInputSchema,
  email: emailInputSchema,
})

export type ProfileFormValues = z.infer<typeof profileFormSchema>

export interface ProfileUpdate {
  name: string
  last_name: string | null
  phone_number: string | null
  email: string
}

export function buildProfileUpdate(values: unknown): ProfileUpdate {
  const confirmedValues = profileFormSchema.parse(values)

  return {
    name: confirmedValues.name,
    last_name: confirmedValues.last_name,
    phone_number: confirmedValues.phone_number,
    email: confirmedValues.email,
  }
}
