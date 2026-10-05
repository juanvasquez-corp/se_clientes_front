import { expect, test } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

declare global {
  interface Window {
    axe: typeof axe
  }
}

test('renders the bootstrap without blocking accessibility violations', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Gestión de usuarios' }),
  ).toBeVisible()
  await expect(page.getByAltText('Aliar S.A.')).toBeVisible()
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
