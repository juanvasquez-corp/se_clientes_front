import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen, within } from '@testing-library/dom'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { UserDetailCard } from './user-detail-card'

const USER: UserResponse = {
  uuid: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  name: 'Carlos',
  last_name: 'Ramírez',
  email: 'carlos.ramirez@example.com',
  phone_number: '+57 310 555 0199',
  role: 'master',
  is_active: true,
}

const roots: ReturnType<typeof createRoot>[] = []

function renderDetailCard(user: UserResponse = USER) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(<UserDetailCard user={user} />)
  })

  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('UserDetailCard', () => {
  it('renders the header with initials and the exact six public user facts in a description list', () => {
    const container = renderDetailCard()
    const heading = screen.getByRole('heading', { level: 2, name: 'Carlos Ramírez' })
    const initials = container.querySelector('[data-slot="initials"]')
    const list = container.querySelector('dl')

    expect(heading).toBeTruthy()
    expect(initials?.textContent).toBe('CR')
    expect(initials?.getAttribute('aria-hidden')).toBe('true')
    expect(list).not.toBeNull()
    expect(list?.querySelectorAll('dt')).toHaveLength(6)
    expect(list?.querySelectorAll('dd')).toHaveLength(6)

    const facts = [...(list?.children ?? [])].map((item) => item.textContent)
    expect(facts).toEqual([
      'NombreCarlos',
      'ApellidoRamírez',
      'Correo electrónicocarlos.ramirez@example.com',
      'Teléfono+57 310 555 0199',
      'RolMaster',
      'EstadoActivo',
    ])
  })

  it('shows "No informado" for null optional fields and computes single-name initials', () => {
    const container = renderDetailCard({
      ...USER,
      last_name: null,
      phone_number: null,
    })
    const initials = container.querySelector('[data-slot="initials"]')
    const list = container.querySelector('dl')
    if (list === null) throw new Error('Expected user detail description list.')

    expect(screen.getByRole('heading', { level: 2, name: 'Carlos' })).toBeTruthy()
    expect(initials?.textContent).toBe('C')
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
    'presents role=%s and is_active=%s with centralized accessible Badge variants',
    (role, isActive, roleLabel, roleVariant, statusLabel, statusVariant) => {
      renderDetailCard({ ...USER, role, is_active: isActive })

      expect(screen.getByText(roleLabel).getAttribute('data-variant')).toBe(roleVariant)
      expect(screen.getByText(statusLabel).getAttribute('data-variant')).toBe(statusVariant)
    },
  )

  it('never renders public UUID, document_number, internal id, dates, passwords or hashes even if extra runtime keys are present', () => {
    const leakedCandidate = {
      ...USER,
      document_number: '1023456789',
      id: 42,
      password: 'PlainSecret123!',
      password_hash: '$2b$12$secretHashValue',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-02T12:00:00Z',
      deleted_at: '2026-10-03T15:00:00Z',
    } as UserResponse

    const container = renderDetailCard(leakedCandidate)
    const content = container.textContent

    expect(content).not.toContain(USER.uuid)
    expect(content).not.toContain('1023456789')
    expect(content).not.toContain('42')
    expect(content).not.toContain('PlainSecret123!')
    expect(content).not.toContain('$2b$12$secretHashValue')
    expect(content).not.toContain('2026-10-01')
    expect(content).not.toContain('2026-10-02')
    expect(content).not.toContain('2026-10-03')
    expect(content).not.toMatch(/cédula|document_number|uuid|identificador|contraseña|password|hash|fecha/iu)
    expect(container.querySelectorAll('dt')).toHaveLength(6)
  })

  it('escapes HTML-like strings literally without creating DOM elements', () => {
    const maliciousName = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const container = renderDetailCard({
      ...USER,
      name: maliciousName,
      last_name: '<b>Apellido</b>',
    })

    expect(screen.getByText(maliciousName)).toBeTruthy()
    expect(screen.getByText('<b>Apellido</b>')).toBeTruthy()
    expect(container.querySelector('img, script, b')).toBeNull()
  })

  it('has 0 axe accessibility violations', async () => {
    const container = renderDetailCard()

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })

  it('accepts the validated public user contract', () => {
    expectTypeOf(UserDetailCard)
      .parameter(0)
      .toEqualTypeOf<{ readonly user: UserResponse }>()
  })
})
