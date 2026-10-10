import { describe, expect, it } from 'vitest'

import packageManifest from '../../package.json'

const expectedScripts = {
  build: 'tsc -b && vite build && node scripts/check-build-budget.mjs dist',
  dev: 'vite',
  lint: 'eslint . --max-warnings 0',
  'openapi:generate': 'node scripts/generate-openapi.mjs',
  preview: 'vite preview --port 5173 --strictPort',
  test: 'vitest run',
  'test:e2e': 'playwright test',
  typecheck: 'tsc -b',
}

describe('quality tooling', () => {
  it('exposes the approved project scripts', () => {
    expect(packageManifest.scripts).toEqual(expectedScripts)
  })

  it('pins the approved ESLint release', () => {
    expect(packageManifest.devDependencies.eslint).toBe('10.12.0')
  })
})
