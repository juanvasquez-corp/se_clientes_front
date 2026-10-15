import { userUuidSchema, type UserResponse } from '../../contracts/schemas/user'

export function canManageTarget(currentUserUuid: string, targetUserUuid: string): boolean {
  const current = userUuidSchema.safeParse(currentUserUuid)
  const target = userUuidSchema.safeParse(targetUserUuid)

  if (!current.success || !target.success) return false
  return current.data.toLowerCase() !== target.data.toLowerCase()
}

export function displayUserName(user: UserResponse): string {
  const lastName = user.last_name?.trim()
  return lastName === undefined || lastName.length === 0
    ? user.name
    : `${user.name} ${lastName}`
}

export function validatedUserUuid(user: UserResponse): string | undefined {
  const result = userUuidSchema.safeParse(user.uuid)
  return result.success ? result.data : undefined
}
