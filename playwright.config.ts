import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { resolveE2EOrigins } from './src/test/e2e-origins'

const e2eOrigins = resolveE2EOrigins(process.env)
const frontendHostname = new URL(e2eOrigins.frontendOrigin).hostname

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.e2e.ts', '**/session.spec.ts'],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: resolve(tmpdir(), 'frontend-project-playwright'),
  preserveOutput: 'never',
  use: {
    baseURL: e2eOrigins.frontendOrigin,
    reducedMotion: 'reduce',
    screenshot: 'off',
    storageState: undefined,
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host ${frontendHostname}`,
    env: {
      VITE_API_BASE_URL: e2eOrigins.apiBaseUrl,
    },
    reuseExistingServer: false,
    stderr: 'pipe',
    stdout: 'pipe',
    timeout: 120_000,
    url: e2eOrigins.frontendOrigin,
  },
})
