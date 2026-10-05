import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

const handlers = [
  http.get('https://example.test/test-support/health', () => {
    return HttpResponse.json({ status: 'ready' })
  }),
]

export const server = setupServer(...handlers)
