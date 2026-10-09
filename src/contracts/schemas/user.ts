import { z } from 'zod'

export const userRoleSchema = z.enum(['superadmin', 'master', 'visualizer'])
export const userUuidSchema = z.uuid()

export const userResponseSchema = z.strictObject({
  uuid: userUuidSchema,
  name: z.string(),
  last_name: z.string().nullable(),
  email: z.email(),
  phone_number: z.string().nullable(),
  rol: userRoleSchema,
  is_active: z.boolean(),
})

export const paginatedUserResponseSchema = z.strictObject({
  total_records: z.number().int(),
  current_page: z.number().int(),
  total_pages: z.number().int(),
  page_size: z.number().int(),
  data: z.array(userResponseSchema),
})

export type UserRole = z.infer<typeof userRoleSchema>
export type UserResponse = z.infer<typeof userResponseSchema>
export type PaginatedUserResponse = z.infer<typeof paginatedUserResponseSchema>
