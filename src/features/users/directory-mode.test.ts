import { describe, expect, it } from 'vitest'

import {
  changeDirectoryPage,
  clearDirectorySearch,
  createListDirectoryState,
  directoryMode,
  submitDirectorySearch,
} from './directory-mode'

describe('directory mode', () => {
  it('keeps list and search mutually exclusive while preserving the list page', () => {
    const list = createListDirectoryState({ page: 4, size: 20 })
    const search = submitDirectorySearch(list, ' ANA@EXAMPLE.COM ')

    expect(directoryMode(list)).toBe('list')
    expect(search).toEqual({
      kind: 'search',
      email: 'ana@example.com',
      preservedPage: 4,
      size: 20,
    })
    expect(directoryMode(search)).toBe('search')
    expect(clearDirectorySearch(search)).toEqual({ kind: 'list', page: 4, size: 20 })
  })

  it('normalizes page and size without introducing filter or URL state', () => {
    const initial = createListDirectoryState({ page: -2, size: 200 })
    const changed = changeDirectoryPage(initial, 7.8)

    expect(initial).toEqual({ kind: 'list', page: 1, size: 50 })
    expect(changed).toEqual({ kind: 'list', page: 1, size: 50 })
    expect(Object.isFrozen(initial)).toBe(true)
    expect(Object.isFrozen(changed)).toBe(true)
  })
})
