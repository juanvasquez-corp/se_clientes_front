import {
  normalizePage,
  normalizePageSize,
  normalizeSearchEmail,
  type UserPageParams,
} from './users-api'

export interface ListDirectoryState {
  readonly kind: 'list'
  readonly page: number
  readonly size: number
}

export interface SearchDirectoryState {
  readonly kind: 'search'
  readonly email: string
  readonly preservedPage: number
  readonly size: number
}

export type DirectoryState = ListDirectoryState | SearchDirectoryState
export type DirectoryMode = DirectoryState['kind']

function immutableState<State extends DirectoryState>(state: State): Readonly<State> {
  return Object.freeze(state)
}

export function createListDirectoryState(params: UserPageParams): ListDirectoryState {
  return immutableState({
    kind: 'list',
    page: normalizePage(params.page),
    size: normalizePageSize(params.size),
  })
}

export function directoryMode(state: DirectoryState): DirectoryMode {
  return state.kind
}

export function submitDirectorySearch(
  state: DirectoryState,
  email: string,
): SearchDirectoryState {
  const preservedPage = state.kind === 'list' ? state.page : state.preservedPage
  return immutableState({
    kind: 'search',
    email: normalizeSearchEmail(email),
    preservedPage,
    size: state.size,
  })
}

export function clearDirectorySearch(state: DirectoryState): ListDirectoryState {
  if (state.kind === 'list') return state
  return createListDirectoryState({ page: state.preservedPage, size: state.size })
}

export function changeDirectoryPage(
  state: DirectoryState,
  page: number,
): DirectoryState {
  if (state.kind === 'search') return state
  return createListDirectoryState({ page, size: state.size })
}
