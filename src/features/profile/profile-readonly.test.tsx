import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen, within } from '@testing-library/dom'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { ProfileReadonly } from './profile-readonly'

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

function renderProfile(profile: UserResponse = PROFILE) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(<ProfileReadonly profile={profile} />)
  })

  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('ProfileReadonly', () => {
  it('renders exactly the six public profile facts as a description list', () => {
    const container = renderProfile()
    const list = container.querySelector('dl')

    expect(list).not.toBeNull()
    expect(list?.querySelectorAll('dt')).toHaveLength(6)
    expect(list?.querySelectorAll('dd')).toHaveLength(6)

    const facts = [...(list?.children ?? [])].map((item) => item.textContent)
    expect(facts).toEqual([
      'NombreAna María',
      'ApellidoLópez',
      'Correo electrónicoana@example.com',
      'Teléfono+57 300 123 4567',
      'RolMaster',
      'EstadoActivo',
    ])
  })

  it('shows exact visible text for absent optional values', () => {
    const container = renderProfile({
      ...PROFILE,
      last_name: null,
      phone_number: null,
    })
    const list = container.querySelector('dl')
    if (list === null) throw new Error('Expected profile description list.')

    expect(within(list).getAllByText('No informado')).toHaveLength(2)
    expect(container.textContent).not.toContain('null')
    for (const value of list.querySelectorAll('dd')) {
      expect(value.textContent.trim().length).toBeGreaterThan(0)
      expect(value.hasAttribute('aria-label')).toBe(false)
    }
  })

  it.each([
    ['superadmin', true, 'Superadministrador', 'role-superadmin', 'Activo', 'status-active'],
    ['superadmin', false, 'Superadministrador', 'role-superadmin', 'Inactivo', 'status-inactive'],
    ['master', true, 'Master', 'role-master', 'Activo', 'status-active'],
    ['master', false, 'Master', 'role-master', 'Inactivo', 'status-inactive'],
    ['visualizer', true, 'Visualizador', 'role-visualizer', 'Activo', 'status-active'],
    ['visualizer', false, 'Visualizador', 'role-visualizer', 'Inactivo', 'status-inactive'],
  ] as const)(
    'presents %s and active=%s as informative badges',
    (role, isActive, roleLabel, roleVariant, statusLabel, statusVariant) => {
      const container = renderProfile({ ...PROFILE, rol: role, is_active: isActive })

      expect(screen.getByText(roleLabel).getAttribute('data-variant')).toBe(roleVariant)
      expect(screen.getByText(statusLabel).getAttribute('data-variant')).toBe(statusVariant)
      expect(container.querySelector('input, select, textarea, button')).toBeNull()
    },
  )

  it('renders external text literally without creating markup', () => {
    const maliciousText = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const container = renderProfile({
      ...PROFILE,
      name: maliciousText,
      last_name: '<b>Apellido</b>',
    })

    expect(screen.getByText(maliciousText)).toBeTruthy()
    expect(screen.getByText('<b>Apellido</b>')).toBeTruthy()
    expect(container.querySelector('img, script, b')).toBeNull()
  })

  it('never renders identifiers or confidential and administrative fields', () => {
    const container = renderProfile()
    const content = container.textContent

    expect(content).not.toContain(PROFILE.uuid)
    expect(content).not.toMatch(/cédula|uuid|identificador|contraseña|password|hash|fecha/iu)
    expect(container.querySelectorAll('dt')).toHaveLength(6)
  })

  it('has no automated accessibility violations', async () => {
    const container = renderProfile()

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })

  it('accepts the validated public profile contract', () => {
    expectTypeOf(ProfileReadonly)
      .parameter(0)
      .toEqualTypeOf<{ readonly profile: UserResponse }>()
  })
})
