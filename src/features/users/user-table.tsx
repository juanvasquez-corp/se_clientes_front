import {
  type UserResponse,
} from '../../contracts/schemas/user'
import { Badge } from '../../shared/ui/badge'
import {
  formatNullable,
  rolePresentation,
  statusPresentation,
} from '../../shared/utils/presentation'
import { UserActions, type UserActionPolicy } from './user-actions'
import { validatedUserUuid } from './user-management'

export interface UserTableProps {
  readonly users: readonly UserResponse[]
  readonly currentUserUuid: string
  readonly actionPolicy: UserActionPolicy
}

interface UserRowProps {
  readonly user: UserResponse
  readonly currentUserUuid: string
  readonly actionPolicy: UserActionPolicy
}

function UserRow({ user, currentUserUuid, actionPolicy }: UserRowProps) {
  if (validatedUserUuid(user) === undefined) return null

  const role = rolePresentation(user.rol)
  const status = statusPresentation(user.is_active)

  return (
    <tr className="border-b border-border-default last:border-b-0">
      <td className="max-w-52 break-words px-4 py-3 font-medium text-text-primary">
        {user.name}
      </td>
      <td className="max-w-52 break-words px-4 py-3 text-text-secondary">
        {formatNullable(user.last_name)}
      </td>
      <td className="max-w-72 break-words px-4 py-3 text-text-secondary">
        {user.email}
      </td>
      <td className="px-4 py-3">
        <Badge variant={role.variant}>{role.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={status.variant}>{status.label}</Badge>
      </td>
      <td className="px-3 py-2">
        <UserActions
          actionPolicy={actionPolicy}
          currentUserUuid={currentUserUuid}
          user={user}
        />
      </td>
    </tr>
  )
}

export function UserTable({ users, currentUserUuid, actionPolicy }: UserTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-default bg-surface-card shadow-brand-card">
      <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
        <caption className="sr-only">Directorio de usuarios</caption>
        <thead className="bg-surface-page text-text-secondary">
          <tr>
            {['Nombre', 'Apellido', 'Correo', 'Rol', 'Estado', 'Acciones'].map((header) => (
              <th key={header} className="px-4 py-3 font-semibold" scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow
              key={user.uuid}
              user={user}
              currentUserUuid={currentUserUuid}
              actionPolicy={actionPolicy}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
