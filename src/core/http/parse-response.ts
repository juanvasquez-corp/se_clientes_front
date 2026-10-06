import type { z } from 'zod'

import { ContractError, type ContractFailureReason } from './errors'

export type { ContractFailureReason } from './errors'
export type ContractFailure = ContractError

export type ParseResponseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ContractFailure }

function contractFailure(reason: ContractFailureReason): ParseResponseResult<never> {
  return {
    success: false,
    error: new ContractError(reason),
  }
}

export function parseJsonResponse<T>(
  rawBody: string,
  schema: z.ZodType<T>,
): ParseResponseResult<T> {
  let parsedBody: unknown

  try {
    parsedBody = JSON.parse(rawBody)
  } catch {
    return contractFailure('invalid-json')
  }

  const result = schema.safeParse(parsedBody)

  if (!result.success) {
    return contractFailure('invalid-shape')
  }

  return { success: true, data: result.data }
}
