import { expect, test, type Page } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

const fixtureUrl = '/tests/fixtures/interface-foundations.html'
const localOrigin = 'http://127.0.0.1:5173'
const pageFailures = new WeakMap<Page, string[]>()

test.beforeEach(({ page }) => {
  const failures: string[] = []
  pageFailures.set(page, failures)

  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`console: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`)
  })
  page.on('response', (response) => {
    const responseUrl = new URL(response.url())

    if (responseUrl.origin === localOrigin && response.status() >= 400) {
      failures.push(`response: ${String(response.status())} ${response.url()}`)
    }
  })
})

test.afterEach(({ page }) => {
  expect(pageFailures.get(page) ?? []).toEqual([])
})

const viewports = [
  { name: 'mobile', width: 360, height: 800, columns: 1 },
  { name: 'tablet', width: 768, height: 900, columns: 1 },
  { name: 'desktop', width: 1440, height: 900, columns: 2 },
] as const

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
}

for (const viewport of viewports) {
  test(`reflows the primitive fixture at ${viewport.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(fixtureUrl)

    await expect(page.locator('link[rel~="icon"]')).toHaveAttribute(
      'href',
      '/assets/favicon.svg',
    )
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fundamentos de interfaz' }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const columnCount = await page
      .locator('[data-layout-grid]')
      .evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length,
      )
    expect(columnCount).toBe(viewport.columns)

    const touchTargets = await page.locator('[data-touch-target]').evaluateAll(
      (elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return { height: box.height, width: box.width }
        }),
    )
    expect(touchTargets.length).toBeGreaterThan(0)
    for (const target of touchTargets) {
      expect(target.height).toBeGreaterThanOrEqual(44)
      expect(target.width).toBeGreaterThanOrEqual(44)
    }

    const longTextFits = await page
      .locator('[data-long-text]')
      .evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      )
    expect(longTextFits).toBe(true)

    await expect(page.locator('[data-state="loading"]')).toBeVisible()
    await expect(page.locator('[data-state="empty"]')).toBeVisible()
    await expect(page.locator('[data-state="error"]')).toBeVisible()
    await expect(page.locator('[data-state="unavailable"]')).toBeVisible()

    await page.keyboard.press('Tab')
    const focus = await page.evaluate(() => {
      const activeElement = document.activeElement
      const style = activeElement ? getComputedStyle(activeElement) : null
      return {
        outlineStyle: style?.outlineStyle,
        outlineWidth: Number.parseFloat(style?.outlineWidth ?? '0'),
      }
    })
    expect(focus.outlineStyle).toBe('solid')
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(3)
  })
}

test('reflows at a 200 percent desktop zoom equivalent', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 450 })
  await page.goto(fixtureUrl)

  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(
    page.locator('[data-toast="success"] [role="status"]'),
  ).toBeVisible()

  const fixtureWidth = await page
    .locator('[data-fixture]')
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(fixtureWidth).toBeLessThanOrEqual(640)
})

test('keeps functionality with reduced motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto(fixtureUrl)

  await expect(
    page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).resolves.toBe(true)

  const motion = await page.evaluate(() => {
    const skeleton = document.querySelector('[data-skeleton]')
    const button = document.querySelector<HTMLButtonElement>('[data-touch-target]')
    const skeletonStyle = skeleton ? getComputedStyle(skeleton) : null
    const buttonStyle = button ? getComputedStyle(button) : null

    const transitionDuration = buttonStyle?.transitionDuration ?? '0s'
    const transitionMilliseconds = transitionDuration.endsWith('ms')
      ? Number.parseFloat(transitionDuration)
      : Number.parseFloat(transitionDuration) * 1000

    return {
      animationName: skeletonStyle?.animationName,
      transitionMilliseconds,
    }
  })
  expect(motion.animationName).toBe('none')
  expect(motion.transitionMilliseconds).toBeLessThanOrEqual(0.01)

  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(
    page.locator('[data-toast="success"] [role="status"]'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Abrir confirmación' }).click()
  await expect(page.getByRole('dialog', { name: 'Confirmar acción' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('has no critical or serious axe violations in a real browser', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(fixtureUrl)
  await page.addScriptTag({ content: axe.source })

  const results: AxeResults = await page.evaluate(() => window.axe.run())
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  )

  expect(blockingViolations).toEqual([])
})
