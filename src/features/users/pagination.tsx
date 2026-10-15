import { normalizePage, normalizePageSize } from './users-api'

const MAX_NAVIGABLE_PAGE = 100_000

export type PaginationInteractionState = 'idle' | 'pending'

export interface PaginationProps {
  readonly totalRecords: number
  readonly currentPage: number
  readonly totalPages: number
  readonly pageSize: number
  readonly interactionState: PaginationInteractionState
  readonly onPageChange: (page: number) => void
}

type PaginationItem = number | 'ellipsis'

function normalizeTotalRecords(totalRecords: number): number {
  return Number.isSafeInteger(totalRecords) && totalRecords >= 0 ? totalRecords : 0
}

function normalizeTotalPages(totalRecords: number, totalPages: number): number {
  if (totalRecords === 0) return 1
  return Number.isSafeInteger(totalPages) && totalPages >= 1 ? totalPages : 1
}

function boundedPageItems(currentPage: number, totalPages: number): readonly PaginationItem[] {
  const navigableTotal = Math.min(totalPages, MAX_NAVIGABLE_PAGE)
  const pages = new Set([
    1,
    navigableTotal,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ])
  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= navigableTotal)
    .sort((first, second) => first - second)
  const items: PaginationItem[] = []

  for (const page of sortedPages) {
    const previous = items.at(-1)
    if (typeof previous === 'number' && page - previous > 1) items.push('ellipsis')
    items.push(page)
  }

  return items
}

export function Pagination({
  totalRecords,
  currentPage,
  totalPages,
  pageSize,
  interactionState,
  onPageChange,
}: PaginationProps) {
  const records = normalizeTotalRecords(totalRecords)
  const pages = normalizeTotalPages(records, totalPages)
  const navigablePages = Math.min(pages, MAX_NAVIGABLE_PAGE)
  const current = Math.min(normalizePage(currentPage), navigablePages)
  const size = normalizePageSize(pageSize)
  const pending = interactionState === 'pending'
  const items = boundedPageItems(current, pages)

  const selectPage = (page: number) => {
    const nextPage = normalizePage(page)
    if (pending || nextPage === current || nextPage > navigablePages) return
    onPageChange(nextPage)
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-4"
      aria-label="Paginación de usuarios"
      aria-busy={pending}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary" aria-live="polite">
        <span>{records} registros</span>
        <span>Página {current} de {pages}</span>
        <span>{size} por página</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-sm border border-border-default bg-surface-card px-3 font-semibold text-brand-heading transition-colors hover:bg-surface-page"
          disabled={pending || current === 1}
          onClick={() => {
            selectPage(current - 1)
          }}
        >
          <span className="sr-only">Página anterior</span>
          <span aria-hidden="true">Anterior</span>
        </button>
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${String(index)}`}
              className="inline-flex min-h-11 min-w-8 items-center justify-center text-text-muted"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-sm border px-3 font-semibold transition-colors ${
                item === current
                  ? 'border-brand-primary bg-brand-primary text-surface-card'
                  : 'border-border-default bg-surface-card text-brand-heading hover:bg-surface-page'
              }`}
              aria-label={item === current ? `Página ${String(item)}, actual` : `Ir a la página ${String(item)}`}
              aria-current={item === current ? 'page' : undefined}
              disabled={pending}
              onClick={() => {
                selectPage(item)
              }}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-sm border border-border-default bg-surface-card px-3 font-semibold text-brand-heading transition-colors hover:bg-surface-page"
          disabled={pending || current === navigablePages}
          onClick={() => {
            selectPage(current + 1)
          }}
        >
          <span className="sr-only">Página siguiente</span>
          <span aria-hidden="true">Siguiente</span>
        </button>
      </div>
    </nav>
  )
}
