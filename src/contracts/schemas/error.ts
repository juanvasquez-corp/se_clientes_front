import { z } from 'zod'

export const apiErrorDetailSchema = z.strictObject({
  detail: z.string(),
})

const validationIssueSchema = z
  .strictObject({
    type: z.string(),
    loc: z.array(z.union([z.string(), z.number()])),
    msg: z.string(),
    input: z.unknown().optional(),
    ctx: z.record(z.string(), z.unknown()).optional(),
  })
  .transform(({ type, loc, msg }) => ({ type, loc, msg }))

export const validationErrorDetailSchema = z.strictObject({
  detail: z.array(validationIssueSchema),
})

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>
export type ValidationIssue = Readonly<{
  type: string
  loc: readonly (string | number)[]
  msg: string
}>
export type ValidationErrorDetail = z.infer<typeof validationErrorDetailSchema>
