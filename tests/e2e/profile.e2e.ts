import { expect, test, type Page, type Route } from '@playwright/test'
import axe, { type AxeResults } from 'axe-core'

import { resolveE2EOrigins } from '../../src/test/e2e-origins'
import { waitForE2EBackend } from '../../src/test/e2e-backend-readiness'

const { apiBaseUrl, frontendOrigin } = resolveE2EOrigins(process.env)
const profileUrl = `${frontendOrigin}/profile`
const realProfileEnabled = process.env.RUN_REAL_PROFILE_E2E === '1'
const USER_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'

interface Profile {
  uuid: string
  name: string
  last_name: string | null
  email: string
  phone_number: string | null
  rol: 'superadmin' | 'master' | 'visualizer'
  is_active: boolean
}

interface PutControl {
  readonly bodies: unknown[]
  readonly count: () => number
  respond: (route: Route, body: Record<string, unknown>, count: number) => Promise<void>
}

const baseProfile: Profile = {
  uuid: USER_UUID,
  name: 'Ana',
  last_name: null,
  email: 'ana@example.com',
  phone_number: null,
  rol: 'master',
  is_active: true,
}

const tokens = {
  access_token: 'fixture-access',
  token_type: 'bearer',
  expires_in: 120,
  csrf_token: 'fixture-csrf',
} as const

function endpoint(path: string): string {
  return `${apiBaseUrl.replace(/\/$/u, '')}${path}`
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Payload string inválido.')
  return value
}

function nullableString(value: unknown): string | null {
  if (value === null) return null
  return requiredString(value)
}

async function preflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') return false
  await route.fulfill({
    status: 204,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': frontendOrigin,
    },
  })
  return true
}

async function mockProfileApp(
  page: Page,
  initialProfile: Profile,
  customRespond?: PutControl['respond'],
) {
  let profile = initialProfile
  let getCount = 0
  let putCount = 0
  let refreshCount = 0
  const bodies: unknown[] = []

  await page.route(endpoint('/auth/csrf'), async (route) => {
    if (await preflight(route)) return
    await route.fulfill({ json: { csrf_token: 'fixture-csrf' } })
  })
  await page.route(endpoint('/auth/refresh'), async (route) => {
    if (await preflight(route)) return
    refreshCount += 1
    await route.fulfill({ json: tokens })
  })
  await page.route(endpoint('/users/me'), async (route) => {
    if (await preflight(route)) return
    const method = route.request().method()
    if (method === 'GET') {
      getCount += 1
      await route.fulfill({ json: profile })
      return
    }
    if (method !== 'PUT') {
      await route.fulfill({ status: 405, json: { detail: 'method' } })
      return
    }

    putCount += 1
    const body = route.request().postDataJSON() as Record<string, unknown>
    bodies.push(body)
    if (customRespond !== undefined) {
      await customRespond(route, body, putCount)
      return
    }
    profile = {
      ...profile,
      name: requiredString(body.name),
      last_name: nullableString(body.last_name),
      phone_number: nullableString(body.phone_number),
      email: requiredString(body.email),
    }
    await route.fulfill({ json: profile })
  })

  return {
    bodies,
    getCount: () => getCount,
    putCount: () => putCount,
    refreshCount: () => refreshCount,
  }
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

async function expectAxe(page: Page) {
  await page.addScriptTag({ content: axe.source })
  const results = await page.evaluate<AxeResults>(async () => window.axe.run(document))
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
}

for (const role of ['superadmin', 'master', 'visualizer'] as const) {
  test(`renders the six-field ${role} profile with exact permissions`, async ({ page }) => {
    const profile = { ...baseProfile, rol: role }
    const control = await mockProfileApp(page, profile)
    await page.goto(profileUrl)

    await expect(page.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeVisible()
    await expect(page.getByText(role === 'superadmin' ? 'Superadministrador' : role === 'master' ? 'Master' : 'Visualizador', { exact: true }).first()).toBeVisible()
    if (role === 'visualizer') {
      for (const label of ['Nombre', 'Apellido', 'Correo electrónico', 'Teléfono', 'Rol', 'Estado']) {
        await expect(page.locator('dt', { hasText: label })).toBeVisible()
      }
      await expect(page.getByText('No informado')).toHaveCount(2)
      await expect(page.getByText('Perfil de solo lectura')).toBeVisible()
      await expect(page.locator('form, input')).toHaveCount(0)
    } else {
      await expect(page.getByRole('form', { name: 'Editar perfil' })).toBeVisible()
      await expect(page.locator('form input')).toHaveCount(4)
      for (const label of ['Nombre', 'Apellido', 'Correo electrónico', 'Teléfono']) {
        await expect(page.getByLabel(new RegExp(label, 'iu'))).toBeVisible()
      }
      await expect(page.locator('dt', { hasText: 'Rol' })).toBeVisible()
      await expect(page.locator('dt', { hasText: 'Estado' })).toBeVisible()
      await expect(page.locator('[name="rol"], [name="is_active"]')).toHaveCount(0)
    }
    expect(control.getCount()).toBe(1)
    await expectNoOverflow(page)
    await expectAxe(page)
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
  })
}

test('validates, preserves/nulls payload, blocks duplicate pending, succeeds and cancels', async ({ page }) => {
  let release: (() => void) | undefined
  let delayPut = false
  const control = await mockProfileApp(page, baseProfile, async (route, body) => {
    if (delayPut) await new Promise<void>((resolve) => { release = resolve })
    await route.fulfill({
      json: {
        ...baseProfile,
        name: requiredString(body.name),
        last_name: nullableString(body.last_name),
        phone_number: nullableString(body.phone_number),
        email: requiredString(body.email),
      },
    })
  })
  await page.goto(profileUrl)
  const name = page.getByRole('textbox', { name: /nombre.*obligatorio/i })
  const lastName = page.getByRole('textbox', { name: /^apellido/i })
  const phone = page.getByRole('textbox', { name: /^teléfono/i })

  await name.fill('')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(name).toBeFocused()
  expect(control.putCount()).toBe(0)
  await name.fill('A'.repeat(51))
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  expect(control.putCount()).toBe(0)
  await name.fill('Ana editada')
  await phone.fill('123456')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(phone).toBeFocused()
  expect(control.putCount()).toBe(0)

  await phone.fill('1234567')
  await lastName.fill('')
  delayPut = true
  await page.getByRole('button', { name: 'Guardar cambios' }).dblclick()
  await expect(page.getByRole('status')).toContainText('Guardando tus cambios.')
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  expect(control.putCount()).toBe(1)
  release?.()
  await expect(page.getByText('Cambios guardados correctamente.')).toBeVisible()
  expect(control.bodies[0]).toEqual({
    name: 'Ana editada',
    last_name: null,
    phone_number: '1234567',
    email: 'ana@example.com',
  })

  await name.fill('Sin guardar')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(name).toHaveValue('Ana editada')
  expect(control.putCount()).toBe(1)
})

test('never replays 401 and preserves 409/422/network/503 context with explicit retry', async ({ page }) => {
  const failures = ['401', '409', '422', 'network', '503', 'success'] as const
  const control = await mockProfileApp(page, baseProfile, async (route, body, count) => {
    const failure = failures[count - 1]
    if (failure === 'network') return route.abort('failed')
    if (failure === '401') return route.fulfill({ status: 401, json: { detail: 'expired' } })
    if (failure === '409') return route.fulfill({ status: 409, json: { detail: 'Correo reservado' } })
    if (failure === '422') {
      return route.fulfill({
        status: 422,
        json: { detail: [{ type: 'value_error', loc: ['body', 'name'], msg: 'Nombre rechazado' }] },
      })
    }
    if (failure === '503') return route.fulfill({ status: 503, json: { detail: 'private' } })
    return route.fulfill({ json: { ...baseProfile, name: requiredString(body.name) } })
  })
  await page.goto(profileUrl)
  const name = page.getByRole('textbox', { name: /nombre.*obligatorio/i })
  await name.fill('Contexto preservado')

  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Tu sesión fue renovada. Confirma para guardar.')).toBeVisible()
  expect(control.putCount()).toBe(1)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Correo reservado')).toBeVisible()
  expect(control.putCount()).toBe(2)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Nombre rechazado')).toBeVisible()
  expect(control.putCount()).toBe(3)
  await name.fill('Contexto preservado')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('El servicio no está disponible.')).toBeVisible()
  expect(control.putCount()).toBe(4)
  await page.getByRole('button', { name: 'Reintentar guardado' }).click()
  await expect(page.getByText('El servicio no está disponible.')).toBeVisible()
  expect(control.putCount()).toBe(5)
  await page.getByRole('button', { name: 'Reintentar guardado' }).click()
  await expect(page.getByText('Cambios guardados correctamente.')).toBeVisible()
  expect(control.putCount()).toBe(6)
  await expect(name).toHaveValue('Contexto preservado')
  await expect(page).toHaveURL(/\/profile$/u)
})

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`Falta ${name}.`)
  return value
}

test('real backend GET/PUT restores editable profiles and keeps visualizer readonly', async ({ context, page }) => {
  test.skip(!realProfileEnabled, 'Requiere RUN_REAL_PROFILE_E2E=1 y credenciales locales.')
  await waitForE2EBackend({ enabled: realProfileEnabled, apiBaseUrl })
  const credentials = [
    ['superadmin', requiredEnvironment('E2E_SUPERADMIN_EMAIL'), requiredEnvironment('E2E_SUPERADMIN_PASSWORD')],
    ['master', requiredEnvironment('E2E_MASTER_EMAIL'), requiredEnvironment('E2E_MASTER_PASSWORD')],
    ['visualizer', requiredEnvironment('E2E_VISUALIZER_EMAIL'), requiredEnvironment('E2E_VISUALIZER_PASSWORD')],
  ] as const

  for (const [role, email, password] of credentials) {
    try {
      await context.clearCookies()
      await page.goto(`${frontendOrigin}/login`)
      await page.getByRole('textbox', { name: /correo electrónico/i }).fill(email)
      await page.getByLabel(/^contraseña.*obligatorio/i).fill(password)
      await page.getByRole('button', { name: 'Ingresar' }).click()
      if (role === 'superadmin') {
        await expect(page).toHaveURL(/\/users$/u)
        await page.goto(profileUrl)
      }
      await expect(page, `${role} debe llegar a Mi perfil`).toHaveURL(/\/profile$/u)

      if (role === 'visualizer') {
        await expect(page.getByText('Perfil de solo lectura')).toBeVisible()
        await expect(page.locator('form')).toHaveCount(0)
      } else {
        const name = page.getByRole('textbox', { name: /nombre.*obligatorio/i })
        const original = await name.inputValue()
        const temporary = original.length < 49 ? `${original} T` : `${original.slice(0, -1)}T`
        try {
          await name.fill(temporary)
          await page.getByRole('button', { name: 'Guardar cambios' }).click()
          await expect(page.getByText('Cambios guardados correctamente.')).toBeVisible()
          await expect(name).toHaveValue(temporary)
        } finally {
          if (await name.isVisible().catch(() => false)) {
            await name.fill(original)
            await page.getByRole('button', { name: 'Guardar cambios' }).click()
            await expect(name).toHaveValue(original)
          }
        }
      }
    } finally {
      const logout = page.getByRole('button', { name: 'Cerrar sesión' })
      if (await logout.first().isVisible().catch(() => false)) {
        await logout.first().click()
        const dialog = page.getByRole('dialog', { name: 'Cerrar sesión' })
        await dialog.getByRole('button', { name: 'Cerrar sesión' }).click()
      }
      await context.clearCookies()
    }
  }
})
