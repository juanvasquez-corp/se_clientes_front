import { expect, test } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

declare global {
  interface Window {
    axe: typeof axe
  }
}

test('renders the session bootstrap without exposing private content', async ({
  page,
}) => {
  await page.goto('/')

  await expect
    .poll(
      async () =>
        (await page.getByRole('status').count()) +
        (await page.getByRole('heading', { name: 'Inicia sesión' }).count()),
    )
    .toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: 'Contenido privado' })).toHaveCount(0)
  await expect(
    page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).resolves.toBe(true)

  await page.addScriptTag({ content: axe.source })
  const results: AxeResults = await page.evaluate(() => window.axe.run())
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  )

  expect(blockingViolations).toEqual([])
})
