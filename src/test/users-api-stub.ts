import type { UsersApi } from '../features/users/users-api'

export function createUsersApiStub(): UsersApi {
  return {
    list: () =>
      Promise.resolve({
        kind: 'success',
        data: {
          total_records: 0,
          current_page: 1,
          total_pages: 1,
          page_size: 10,
          data: [],
        },
      }),
    search: () => Promise.resolve({ kind: 'not-found' }),
  }
}
