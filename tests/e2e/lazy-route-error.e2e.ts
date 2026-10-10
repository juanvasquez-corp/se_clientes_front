import { expect, test } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'
import { build, preview, type PreviewServer } from 'vite'

const productionOrigin = 'http://localhost:5174'
let previewServer: PreviewServer | undefined

declare global {
  interface Window {
    axe: typeof axe
  }
}

test.beforeAll(async () => {
  await build({ logLevel: 'silent' })
  previewServer = await preview({
    logLevel: 'silent',
    preview: { host: 'localhost', port: 5174, strictPort: true },
  })
})

test.afterAll(async () => {
  await previewServer?.close()
})

test('contains a failed production lazy chunk and recovers with a full reload', async ({
  page,
}) => {
  const loadedLoginChunks: number[] = []
  page.on('response', (response) => {
    if (/\/assets\/login-route-[^/]+\.js$/u.test(response.url())) {
      loadedLoginChunks.push(response.status())
    }
  })
  await page.route('**/api/auth/csrf', async (route) => {
    const headers = {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Origin': productionOrigin,
    }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    await route.fulfill({ status: 401, headers, json: { detail: 'dead session' } })
  })
  await page.route('**/assets/login-route-*.js', (route) => route.abort('failed'))

  await page.goto(`${productionOrigin}/login`)

  const heading = page.getByRole('heading', {
    name: 'No pudimos cargar esta página',
  })
  const alert = page.getByRole('alert')
  const recovery = page.getByRole('link', { name: 'Recargar página' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(alert).toContainText(
    'Ocurrió un problema al descargar el contenido. Recarga la página para intentarlo nuevamente.',
  )
  await expect(alert).not.toContainText(/ChunkLoadError|login-route|https?:\/\//iu)
  await expect(page.getByText(/contenido privado/iu)).toHaveCount(0)
  await expect(recovery).toHaveAttribute('href', '/login')
  await expect(recovery).not.toHaveAttribute('target', /.+/u)

  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const results: AxeResults = await page.evaluate(() => window.axe.run())
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])

  await page.unroute('**/assets/login-route-*.js')
  await recovery.click()

  await expect(page).toHaveURL(`${productionOrigin}/login`)
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
  expect(loadedLoginChunks).toEqual([200])
})
