import axios from 'axios'
import { describe, expect, it } from 'vitest'

describe('test network', () => {
  it('observes a response intercepted at the network boundary', async () => {
    const response = await axios.get<{ status: string }>(
      'https://example.test/test-support/health',
      { timeout: 1_000 },
    )

    expect(response.status).toBe(200)
    expect(response.data).toEqual({ status: 'ready' })
  })
})
