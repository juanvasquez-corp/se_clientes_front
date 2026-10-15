import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { screen, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizePage } from './users-api'
import {
  Pagination,
  type PaginationInteractionState,
} from './pagination'
import { lastValidPageAfterDelete } from './pagination-domain'

const roots: Root[] = []

interface HarnessProps {
  readonly initialPage: number
  readonly totalPages: number
  readonly totalRecords?: number
  readonly pageSize?: number
  readonly onPageChange?: (page: number) => void
}

function PaginationHarness({
  initialPage,
  totalPages,
  totalRecords = 95,
  pageSize = 10,
  onPageChange = () => undefined,
}: HarnessProps) {
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [interactionState, setInteractionState] =
    useState<PaginationInteractionState>('idle')

  return (
    <Pagination
      totalRecords={totalRecords}
      currentPage={currentPage}
      totalPages={totalPages}
      pageSize={pageSize}
      interactionState={interactionState}
      onPageChange={(page) => {
        onPageChange(page)
        setCurrentPage(page)
        setInteractionState('pending')
      }}
    />
  )
}

async function renderPagination(component: React.ReactNode) {
  const container = document.createElement('main')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(component)
    await Promise.resolve()
  })
  return container
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  }
})

describe('pagination domain', () => {
  it.each([
    [1, 1],
    [7, 7],
    [100_001, 100_000],
    [0, 1],
    [-3, 1],
    [2.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('normalizes page %s to %s', (input, expected) => {
    expect(normalizePage(input)).toBe(expected)
  })

  it.each([
    [{ total: 0, size: 10, current: 4 }, 1],
    [{ total: 1, size: 10, current: 4 }, 1],
    [{ total: 20, size: 10, current: 3 }, 2],
    [{ total: 21, size: 10, current: 3 }, 3],
    [{ total: 21, size: 0, current: 30 }, 21],
    [{ total: 5_000_001, size: 50, current: 100_001 }, 100_000],
    [{ total: Number.NaN, size: 10, current: 3 }, 1],
  ])('finds one stable last valid page for %o', ({ total, size, current }, expected) => {
    expect(lastValidPageAfterDelete(total, size, current)).toBe(expected)
  })
})

describe('Pagination', () => {
  it('shows all effective metadata with an accessible navigation label', async () => {
    await renderPagination(
      <Pagination
        totalRecords={95}
        currentPage={4}
        totalPages={10}
        pageSize={10}
        interactionState="idle"
        onPageChange={() => undefined}
      />,
    )

    const navigation = screen.getByRole('navigation', { name: 'Paginación de usuarios' })
    expect(within(navigation).getByText('95 registros')).toBeTruthy()
    expect(within(navigation).getByText('Página 4 de 10')).toBeTruthy()
    expect(within(navigation).getByText('10 por página')).toBeTruthy()
    expect(within(navigation).getByRole('button', { name: 'Página 4, actual' }).getAttribute('aria-current'))
      .toBe('page')
  })

  it('keeps an empty total in a stable page-one state without division by zero', async () => {
    const onPageChange = vi.fn()
    await renderPagination(
      <Pagination
        totalRecords={0}
        currentPage={8}
        totalPages={0}
        pageSize={0}
        interactionState="idle"
        onPageChange={onPageChange}
      />,
    )

    expect(screen.getByText('0 registros')).toBeTruthy()
    expect(screen.getByText('Página 1 de 1')).toBeTruthy()
    expect(screen.getByText('1 por página')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Página anterior' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Página siguiente' }).hasAttribute('disabled')).toBe(true)
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it.each([
    [1, true, false],
    [5, false, false],
    [10, false, true],
  ])('applies first/intermediate/last boundaries on page %i', async (page, previousDisabled, nextDisabled) => {
    await renderPagination(
      <PaginationHarness initialPage={page} totalPages={10} />,
    )

    expect(screen.getByRole('button', { name: 'Página anterior' }).hasAttribute('disabled'))
      .toBe(previousDisabled)
    expect(screen.getByRole('button', { name: 'Página siguiente' }).hasAttribute('disabled'))
      .toBe(nextDisabled)
  })

  it('invokes a valid page selection once and blocks duplicate pending clicks', async () => {
    const onPageChange = vi.fn()
    await renderPagination(
      <PaginationHarness
        initialPage={5}
        totalPages={10}
        onPageChange={onPageChange}
      />,
    )
    const user = userEvent.setup()
    const next = screen.getByRole('button', { name: 'Página siguiente' })

    await act(async () => { await user.dblClick(next) })

    expect(onPageChange).toHaveBeenCalledTimes(1)
    expect(onPageChange).toHaveBeenCalledWith(6)
    expect(next.hasAttribute('disabled')).toBe(true)
  })

  it('does not invoke page change from disabled boundaries', async () => {
    const onPageChange = vi.fn()
    await renderPagination(
      <Pagination
        totalRecords={10}
        currentPage={1}
        totalPages={1}
        pageSize={10}
        interactionState="idle"
        onPageChange={onPageChange}
      />,
    )
    const user = userEvent.setup()

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Página anterior' })) })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Página siguiente' })) })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Página 1, actual' })) })

    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('renders a bounded page window for huge totals', async () => {
    await renderPagination(
      <Pagination
        totalRecords={50_000_000}
        currentPage={50_000}
        totalPages={1_000_000}
        pageSize={50}
        interactionState="idle"
        onPageChange={() => undefined}
      />,
    )
    const navigation = screen.getByRole('navigation', { name: 'Paginación de usuarios' })

    expect(within(navigation).getAllByRole('button')).toHaveLength(7)
    expect(within(navigation).getAllByText('…')).toHaveLength(2)
    expect(within(navigation).getByText('Página 50000 de 1000000')).toBeTruthy()
  })

  it('keeps focus stable, provides 44px controls and has no axe violations', async () => {
    const container = await renderPagination(
      <PaginationHarness initialPage={5} totalPages={10} />,
    )
    const user = userEvent.setup()
    const navigation = screen.getByRole('navigation', { name: 'Paginación de usuarios' })

    await act(async () => { await user.tab() })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Página anterior' }))
    for (const button of within(navigation).getAllByRole('button')) {
      expect(button.className).toMatch(/min-h-11/)
    }
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
