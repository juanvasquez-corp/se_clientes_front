import { expect, test, type Page } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

const fixtureUrl = '/tests/fixtures/login-page.html'
const localOrigin = 'http://127.0.0.1:5173'
const pageFailures = new WeakMap<Page, string[]>()

test.beforeEach(({ page }) => {
  const failures: string[] = []
  pageFailures.set(page, failures)

  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`)
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

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

const viewports = [
  {
    name: 'desktop',
    width: 1440,
    height: 900,
    background: 'login-background.webp',
  },
  {
    name: 'mobile',
    width: 390,
    height: 844,
    background: 'login-background-mobile.webp',
  },
  {
    name: 'narrow mobile',
    width: 360,
    height: 800,
    background: 'login-background-mobile.webp',
  },
] as const

for (const viewport of viewports) {
  test(`matches the login composition at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(fixtureUrl)

    await expect(
      page.getByRole('heading', { level: 1, name: 'Inicia sesión' }),
    ).toBeVisible()
    await expect(page.getByRole('img', { name: 'Aliar S.A.' })).toBeVisible()
    await expect(page.getByRole('form', { name: 'Inicio de sesión' })).toBeVisible()
    await expect(page.getByRole('link')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)

    const backgroundImage = await page
      .locator('main.login-page')
      .evaluate((element) => getComputedStyle(element).backgroundImage)
    expect(backgroundImage).toContain(viewport.background)

    const controls = await page
      .locator('form input, form button')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return { height: box.height, width: box.width }
        }),
      )
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      expect(control.height).toBeGreaterThanOrEqual(44)
      expect(control.width).toBeGreaterThanOrEqual(44)
    }

    const card = await page.locator('.login-page__card').boundingBox()
    expect(card).not.toBeNull()
    if (!card) return

    expect(card.x).toBeGreaterThanOrEqual(16)
    expect(card.x + card.width).toBeLessThanOrEqual(viewport.width - 16 + 1)
    if (viewport.name === 'desktop') {
      expect(card.x).toBeGreaterThan(viewport.width / 2)
    }
  })
}

for (const [role, destination] of [
  ['superadmin', '/users'],
  ['master', '/profile'],
  ['visualizer', '/profile'],
] as const) {
  test(`delivers an existing ${role} session to ${destination}`, async ({ page }) => {
    await page.goto(`${fixtureUrl}?role=${role}`)

    await expect(page).toHaveURL(new RegExp(`${destination}$`))
    await expect(page.getByRole('form', { name: 'Inicio de sesión' })).toHaveCount(0)
  })
}

test('has no critical or serious axe violations in desktop and mobile', async ({
  page,
}) => {
  for (const viewport of [viewports[0], viewports[1]]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(fixtureUrl)
    await page.addScriptTag({ content: axe.source })

    const results: AxeResults = await page.evaluate(() => window.axe.run())
    const blockingViolations = results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    )
    expect(blockingViolations).toEqual([])
  }
})
