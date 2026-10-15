import { createServer, type IncomingHttpHeaders } from 'node:http'
import { http, passthrough } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { waitForE2EBackend } from './e2e-backend-readiness'
import { resolveE2EOrigins } from './e2e-origins'
import { server as mockServer } from './server'

const origins = resolveE2EOrigins({ E2E_API_BASE_URL: 'http://localhost:8123/api' })
const contract = {
  openapi: '3.1.0',
  info: { title: 'Synthetic API', version: '1.0.0' },
  paths: { '/api/auth/login': { post: { responses: { '200': { description: 'OK' } } } } },
}

describe('E2E backend readiness', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns immediately for a valid contract using an anonymous root GET', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(contract))
    await waitForE2EBackend({ enabled: true, apiBaseUrl: origins.apiBaseUrl }, { request })
    expect(request).toHaveBeenCalledTimes(1)
    const signal = request.mock.calls[0]?.[1]?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(request).toHaveBeenCalledWith('http://localhost:8123/openapi.json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal,
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not resolve an origin or contact the backend when disabled', async () => {
    const request = vi.fn<typeof fetch>()
    await waitForE2EBackend({ enabled: false, apiBaseUrl: 'invalid' }, { request })
    expect(request).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('polls progressively at 0, 100, 300, 700, 1500 ms and returns as soon as ready', async () => {
    const start = Date.now()
    const attempts: number[] = []
    const request = vi.fn<typeof fetch>().mockImplementation(() => {
      attempts.push(Date.now() - start)
      return Promise.resolve(attempts.length === 5 ? Response.json(contract) : new Response(null, { status: 503 }))
    })
    const ready = waitForE2EBackend(
      { enabled: true, apiBaseUrl: origins.apiBaseUrl },
      { request, now: () => Date.now() },
    )
    await vi.advanceTimersByTimeAsync(1500)
    await ready
    expect(attempts).toEqual([0, 100, 300, 700, 1500])
    expect(vi.getTimerCount()).toBe(0)
  })

  const failures = [
    { label: 'refused connection', code: 'transport', response: () => Promise.reject(new Error('PRIVATE_BODY_TOKEN')) },
    { label: 'HTTP error', code: 'http', response: () => Promise.resolve(new Response('PRIVATE_BODY_TOKEN', { status: 503 })) },
    { label: 'redirect', code: 'http', response: () => Promise.resolve(new Response(null, { status: 302, headers: { Location: 'http://private.invalid/token' } })) },
    { label: 'invalid JSON', code: 'json', response: () => Promise.resolve(new Response('PRIVATE_BODY_TOKEN')) },
    { label: 'invalid contract', code: 'contract', response: () => Promise.resolve(Response.json({ openapi: '3.1.0', private: 'PRIVATE_BODY_TOKEN' })) },
    { label: 'missing login operation', code: 'contract', response: () => Promise.resolve(Response.json({ ...contract, paths: {} })) },
    { label: 'invalid operation', code: 'contract', response: () => Promise.resolve(Response.json({ ...contract, paths: { '/api/auth/login': { post: null } } })) },
    { label: 'invalid version', code: 'contract', response: () => Promise.resolve(Response.json({ ...contract, openapi: 'not-openapi' })) },
  ]

  for (const { label, code, response } of failures) {
    it(`ends ${label} at the global deadline with only a safe diagnostic`, async () => {
      const start = Date.now()
      const attempts: number[] = []
      const request = vi.fn<typeof fetch>().mockImplementation(() => {
        attempts.push(Date.now() - start)
        return response()
      })
      const result = waitForE2EBackend(
        { enabled: true, apiBaseUrl: 'http://PRIVATE_USER:PRIVATE_PASSWORD@localhost:8123/api?private=PRIVATE_TOKEN' },
        { request, now: () => Date.now() },
      ).catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(10_000)
      const error = await result
      expect(error).toBeInstanceOf(Error)
      if (!(error instanceof Error)) throw new Error('Expected readiness error')
      expect(error.message).toBe(`E2E_BACKEND_NOT_READY: ${code} (10000 ms).`)
      expect(error.cause).toBeUndefined()
      expect(error.stack).not.toMatch(/PRIVATE_|http:/u)
      expect(attempts).toEqual([0, 100, 300, 700, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 9500])
      expect(request.mock.calls.every(([url]) => url === 'http://localhost:8123/openapi.json')).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    })
  }

  it('bounds hung requests even if the transport ignores abort and clamps the final request', async () => {
    const start = Date.now()
    const attempts: number[] = []
    const aborted: number[] = []
    const request = vi.fn<typeof fetch>().mockImplementation((_url, options) => {
      attempts.push(Date.now() - start)
      options?.signal?.addEventListener('abort', () => aborted.push(Date.now() - start))
      return new Promise<Response>(() => undefined)
    })
    const result = waitForE2EBackend(
      { enabled: true, apiBaseUrl: origins.apiBaseUrl },
      { request, now: () => Date.now() },
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await result).toEqual(new Error('E2E_BACKEND_NOT_READY: request-timeout (10000 ms).'))
    expect(attempts).toEqual([0, 1100, 2300, 3700, 5500, 7500, 9500])
    expect(aborted).toEqual([1000, 2100, 3300, 4700, 6500, 8500, 10000])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('counts a hanging response body within the request budget', async () => {
    const response = Response.json(contract)
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => undefined))
    const request = vi.fn<typeof fetch>().mockResolvedValue(response)
    const result = waitForE2EBackend(
      { enabled: true, apiBaseUrl: origins.apiBaseUrl },
      { request, now: () => Date.now() },
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await result).toEqual(new Error('E2E_BACKEND_NOT_READY: request-timeout (10000 ms).'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not accept a valid response delivered after the deadline', async () => {
    let now = 0
    const request = vi.fn<typeof fetch>().mockImplementation(() => {
      now = 10_001
      return Promise.resolve(Response.json(contract))
    })
    await expect(waitForE2EBackend(
      { enabled: true, apiBaseUrl: origins.apiBaseUrl },
      { request, now: () => now },
    )).rejects.toThrow('E2E_BACKEND_NOT_READY: deadline (10000 ms).')
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sanitizes invalid origins without retaining the URL error', async () => {
    const request = vi.fn<typeof fetch>()
    await expect(waitForE2EBackend(
      { enabled: true, apiBaseUrl: 'PRIVATE_INVALID_ORIGIN' }, { request },
    )).rejects.toThrow('E2E_BACKEND_INVALID_ORIGIN.')
    expect(request).not.toHaveBeenCalled()
  })

  it('uses native HTTP without following redirects or replaying response cookies while a synthetic backend starts', async () => {
    vi.useRealTimers()
    const requests: { url: string | undefined; headers: IncomingHttpHeaders }[] = []
    const server = createServer((request, response) => {
      requests.push({ url: request.url, headers: request.headers })
      if (requests.length === 1) {
        response.writeHead(302, { Location: '/private', 'Set-Cookie': 'synthetic=PRIVATE_COOKIE' })
        response.end()
      } else if (requests.length === 2) {
        response.writeHead(503, { 'Set-Cookie': 'synthetic=PRIVATE_COOKIE' })
        response.end('PRIVATE_BODY_TOKEN')
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(contract))
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected synthetic TCP server')
    const base = `http://127.0.0.1:${String(address.port)}`
    mockServer.use(http.get(`${base}/*`, () => passthrough()))
    try {
      await waitForE2EBackend({ enabled: true, apiBaseUrl: `${base}/api` })
      expect(requests.map(({ url }) => url)).toEqual(['/openapi.json', '/openapi.json', '/openapi.json'])
      for (const { headers } of requests) {
        expect(headers.authorization).toBeUndefined()
        expect(headers.cookie).toBeUndefined()
        expect(headers['x-csrf-token']).toBeUndefined()
        expect(headers.accept).toBe('application/json')
      }
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error)
        else resolve()
      }))
    }
  })
})
