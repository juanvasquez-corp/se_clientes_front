import { act, createRef } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { ProfileContent } from './profile-content'
import {
  ProfileForm,
  type ProfileFormController,
} from './profile-form'
import type { ProfileUpdate } from './profile-form-schema'

const PROFILE: UserResponse = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana María',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: '+57 300 123 4567',
  rol: 'master',
  is_active: true,
}

const roots: ReturnType<typeof createRoot>[] = []

async function renderForm({
  controllerRef,
  onSubmit = vi.fn<(payload: ProfileUpdate) => void>(),
  profile = PROFILE,
}: {
  controllerRef?: React.Ref<ProfileFormController>
  onSubmit?: (payload: ProfileUpdate) => void | Promise<void>
  profile?: UserResponse
} = {}) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  await act(async () => {
    root.render(
      <ProfileContent
        profile={profile}
        editableContent={
          <ProfileForm
            controllerRef={controllerRef}
            interaction={{ cancel: () => undefined, state: 'idle' }}
            profile={profile}
            onSubmit={onSubmit}
          />
        }
      />,
    )
    await Promise.resolve()
  })

  return { container, onSubmit, scope: within(container) }
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  }
})

describe('ProfileForm', () => {
  it.each(['master', 'superadmin'] as const)(
    'renders exactly four editable profile controls for %s',
    async (role) => {
      const { container, scope } = await renderForm({ profile: { ...PROFILE, rol: role } })
      const controls = container.querySelectorAll('input, select, textarea')
      const name = scope.getByRole<HTMLInputElement>('textbox', {
        name: /nombre.*obligatorio/i,
      })
      const lastName = scope.getByRole<HTMLInputElement>('textbox', { name: /^apellido/i })
      const phone = scope.getByRole<HTMLInputElement>('textbox', { name: /^teléfono/i })
      const email = scope.getByRole<HTMLInputElement>('textbox', {
        name: /correo electrónico.*obligatorio/i,
      })

      expect(controls).toHaveLength(4)
      expect([name.type, lastName.type, phone.type, email.type]).toEqual([
        'text',
        'text',
        'tel',
        'email',
      ])
      expect([name.autocomplete, lastName.autocomplete, phone.autocomplete, email.autocomplete]).toEqual([
        'name',
        'family-name',
        'tel',
        'email',
      ])
      expect([name.value, lastName.value, phone.value, email.value]).toEqual([
        'Ana María',
        'López',
        '+57 300 123 4567',
        'ana@example.com',
      ])
      expect(scope.getByText(role === 'master' ? 'Master' : 'Superadministrador')).toBeTruthy()
      expect(scope.getByText('Activo')).toBeTruthy()
      expect(container.querySelector('[name="rol"], [name="is_active"]')).toBeNull()
      expect(container.textContent).not.toMatch(/cédula|contraseña|password|uuid|eliminar/iu)
    },
  )

  it('shows null optional values as empty editable controls', async () => {
    const { scope } = await renderForm({
      profile: { ...PROFILE, last_name: null, phone_number: null },
    })

    expect(scope.getByRole<HTMLInputElement>('textbox', { name: /^apellido/i }).value).toBe('')
    expect(scope.getByRole<HTMLInputElement>('textbox', { name: /^teléfono/i }).value).toBe('')
  })

  it.each(['master', 'superadmin'] as const)(
    'submits the exact complete %s payload and preserves unchanged optional values',
    async (role) => {
      const user = userEvent.setup()
      const onSubmit = vi.fn<(payload: ProfileUpdate) => void>()
      const { scope } = await renderForm({ onSubmit, profile: { ...PROFILE, rol: role } })

      await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Ana María',
        last_name: 'López',
        phone_number: '+57 300 123 4567',
        email: 'ana@example.com',
      })
      expect(Object.keys(onSubmit.mock.calls[0]?.[0] ?? {})).toEqual([
        'name',
        'last_name',
        'phone_number',
        'email',
      ])
    },
  )

  it('normalizes submitted values and sends deliberate optional clears as null', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(payload: ProfileUpdate) => void>()
    const { scope } = await renderForm({ onSubmit })
    const name = scope.getByRole('textbox', { name: /nombre.*obligatorio/i })
    const lastName = scope.getByRole('textbox', { name: /^apellido/i })
    const phone = scope.getByRole('textbox', { name: /^teléfono/i })
    const email = scope.getByRole('textbox', { name: /correo electrónico.*obligatorio/i })

    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, '  Bea  ') })
    await act(async () => { await user.clear(lastName) })
    await act(async () => { await user.type(lastName, '   ') })
    await act(async () => { await user.clear(phone) })
    await act(async () => { await user.clear(email) })
    await act(async () => { await user.type(email, '  BEA@Example.COM  ') })
    await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Bea',
      last_name: null,
      phone_number: null,
      email: 'bea@example.com',
    })
  })

  it.each([
    ['name', '', /nombre.*obligatorio/i],
    ['name', 'A'.repeat(51), /nombre.*obligatorio/i],
    ['last_name', 'A'.repeat(51), /^apellido/i],
    ['phone_number', '1'.repeat(6), /^teléfono/i],
    ['phone_number', '1'.repeat(21), /^teléfono/i],
    ['email', 'correo-invalido', /correo electrónico.*obligatorio/i],
  ] as const)(
    'rejects invalid %s boundary, focuses it and does not submit',
    async (field, value, accessibleName) => {
      const user = userEvent.setup()
      const onSubmit = vi.fn<(payload: ProfileUpdate) => void>()
      const { container, scope } = await renderForm({ onSubmit })
      const control = scope.getByRole<HTMLInputElement>('textbox', { name: accessibleName })

      await act(async () => { await user.clear(control) })
      if (value !== '') await act(async () => { await user.type(control, value) })
      await act(async () => { await user.click(scope.getByRole('button', { name: 'Guardar cambios' })) })

      const error = container.querySelector(`#profile-${field.replace('_', '-')}-error`)
      if (error === null) throw new Error(`Expected validation error for ${field}.`)
      expect(error.textContent.trim().length).toBeGreaterThan(0)
      expect(error.getAttribute('aria-live')).toBe('polite')
      expect(control.getAttribute('aria-invalid')).toBe('true')
      expect(control.getAttribute('aria-describedby')).toContain(error.id)
      expect(document.activeElement).toBe(control)
      expect(onSubmit).not.toHaveBeenCalled()
    },
  )

  it('exposes a typed reset controller for workflow cancellation', async () => {
    const user = userEvent.setup()
    const controllerRef = createRef<ProfileFormController>()
    const { scope } = await renderForm({ controllerRef })
    const name = scope.getByRole<HTMLInputElement>('textbox', { name: /nombre.*obligatorio/i })

    await act(async () => { await user.clear(name) })
    await act(async () => { await user.type(name, 'Cambio local') })
    await act(async () => {
      controllerRef.current?.reset({ ...PROFILE, name: 'Confirmado' })
      await Promise.resolve()
    })

    expect(name.value).toBe('Confirmado')
    expect(scope.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
  })

  it('never mounts a form for visualizer even when an editable form slot is supplied', async () => {
    const onSubmit = vi.fn<(payload: ProfileUpdate) => void>()
    const { container } = await renderForm({
      onSubmit,
      profile: { ...PROFILE, rol: 'visualizer' },
    })

    expect(container.querySelector('form, input, button')).toBeNull()
    expect(container.textContent).toContain('Perfil de solo lectura')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('has no axe violations with role and status remaining informative', async () => {
    const { container } = await renderForm()

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
