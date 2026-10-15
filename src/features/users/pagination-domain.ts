import { normalizePage, normalizePageSize } from './users-api'

const MAX_NAVIGABLE_PAGE = 100_000

export function lastValidPageAfterDelete(
  total: number,
  size: number,
  current: number,
): number {
  const validTotal = Number.isSafeInteger(total) && total >= 0 ? total : 0
  const validSize = normalizePageSize(size)
  const validCurrent = normalizePage(current)
  const lastPage = validTotal === 0
    ? 1
    : Math.min(MAX_NAVIGABLE_PAGE, Math.ceil(validTotal / validSize))

  return Math.min(validCurrent, lastPage)
}
