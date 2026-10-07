/// <reference types="node" />

import { describe, expect, it } from 'vitest'

import playwrightConfig from '../../playwright.config'
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_FRONTEND_ORIGIN,
  resolveE2EOrigins,
} from './e2e-origins'

describe('E2E loopback origin policy', () => {
  it('uses localhost uniformly for frontend, API and backend preflight defaults', () => {
    const origins = resolveE2EOrigins({})

    expect(origins).toEqual({
      apiBaseUrl: 'http://localhost:8000/api',
      frontendOrigin: 'http://localhost:5173',
    })
    expect(new URL(origins.frontendOrigin).hostname).toBe(
      new URL(origins.apiBaseUrl).hostname,
    )
    expect(DEFAULT_FRONTEND_ORIGIN).toBe(origins.frontendOrigin)
    expect(DEFAULT_API_BASE_URL).toBe(origins.apiBaseUrl)
    expect(playwrightConfig.use?.baseURL).toBe(origins.frontendOrigin)
    expect(playwrightConfig.webServer).toMatchObject({
      url: origins.frontendOrigin,
      env: { VITE_API_BASE_URL: origins.apiBaseUrl },
    })
  })

  it('rejects mixed loopback aliases instead of silently losing host-only cookies', () => {
    expect(() =>
      resolveE2EOrigins({
        E2E_API_BASE_URL: 'http://127.0.0.1:8000/api',
        E2E_FRONTEND_ORIGIN: 'http://localhost:5173',
      }),
    ).toThrow('El frontend y la API E2E deben usar el mismo hostname.')
  })
})
