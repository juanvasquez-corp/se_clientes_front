import type { ValidationIssue } from '../../contracts/schemas/error'

const FASTAPI_LOCATION_PREFIXES = new Set(['body', 'query', 'path', 'header', 'cookie'])
const RESERVED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

export interface ValidationIssueMapping<Field extends string> {
  fields: Partial<Record<Field, string>>
  general: string[]
}

function getDirectFieldLocation(location: ValidationIssue['loc']): string | undefined {
  if (location.length !== 2) return undefined

  const prefix = location[0]
  const field = location[1]

  if (
    typeof prefix !== 'string' ||
    !FASTAPI_LOCATION_PREFIXES.has(prefix) ||
    typeof field !== 'string' ||
    RESERVED_FIELD_NAMES.has(field)
  ) {
    return undefined
  }

  return field
}

export function mapValidationIssues<const Field extends string>(
  detail: readonly ValidationIssue[],
  allowedFields: readonly Field[],
): ValidationIssueMapping<Field> {
  const fields: Partial<Record<Field, string>> = {}
  const general: string[] = []
  const assignedFields = new Set<Field>()

  for (const issue of detail) {
    const locatedField = getDirectFieldLocation(issue.loc)
    const allowedField = allowedFields.find((field) => field === locatedField)

    if (allowedField === undefined) {
      general.push(issue.msg)
      continue
    }

    if (!assignedFields.has(allowedField)) {
      fields[allowedField] = issue.msg
      assignedFields.add(allowedField)
    }
  }

  return { fields, general }
}
