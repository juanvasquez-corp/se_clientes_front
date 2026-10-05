import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    pool: 'vmForks',
    setupFiles: ['./src/test/polyfills.ts', './src/test/setup.ts'],
  },
})
