import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import type { UserResponse } from '../../contracts/schemas/user'
import { ProfileContent } from './profile-content'

const VISUALIZER_PROFILE: UserResponse = {
  uuid: '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75',
  name: 'Ana María',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: '+57 300 123 4567',
  rol: 'visualizer',
  is_active: true,
}

const roots: ReturnType<typeof createRoot>[] = []

function renderContent(
  profile: UserResponse = VISUALIZER_PROFILE,
  editableContent: React.ReactNode = <button type="button">Guardar cambios</button>,
) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(
      <ProfileContent profile={profile} editableContent={editableContent} />,
    )
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

describe('ProfileContent visualizer mode', () => {
  it('renders all six facts and explicitly communicates read-only access', () => {
    const container = renderContent()
    const scope = within(container)

    expect(scope.getByText('Perfil de solo lectura')).toBeTruthy()
    expect(
      scope.getByText('Puedes consultar tu perfil. No puedes editar información.'),
    ).toBeTruthy()
    expect(container.querySelectorAll('dt')).toHaveLength(6)
    expect(container.querySelectorAll('dd')).toHaveLength(6)
    expect(scope.getByText('Visualizador').getAttribute('data-variant')).toBe(
      'role-visualizer',
    )
    expect(scope.getByText('Activo').getAttribute('data-variant')).toBe(
      'status-active',
    )
  })

  it('does not mount editable, administrative or confidential controls and text', () => {
    const container = renderContent(
      VISUALIZER_PROFILE,
      <div>
        <button type="button">Guardar cambios</button>
        <button type="button">Editar usuario</button>
        <label>
          Cédula
          <input name="cedula" />
        </label>
      </div>,
    )
    const content = container.textContent

    expect(container.querySelector('button, input, select, textarea, form')).toBeNull()
    expect(content).not.toMatch(
      /guardar cambios|editar usuario|eliminar|administrar usuarios|cédula|contraseña|password|hash/iu,
    )
    expect(content).not.toContain(VISUALIZER_PROFILE.uuid)
  })

  it('keeps absence checks scoped so a future AppShell logout is not an admin action', () => {
    const shellLogout = document.createElement('button')
    shellLogout.textContent = 'Cerrar sesión'
    document.body.append(shellLogout)
    const container = renderContent()

    expect(container.querySelector('button')).toBeNull()
    expect(shellLogout.isConnected).toBe(true)
  })

  it('renders malicious profile values as literal text', () => {
    const maliciousText = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const container = renderContent({
      ...VISUALIZER_PROFILE,
      name: maliciousText,
      last_name: '<b>Apellido</b>',
    })
    const scope = within(container)

    expect(scope.getByText(maliciousText)).toBeTruthy()
    expect(scope.getByText('<b>Apellido</b>')).toBeTruthy()
    expect(container.querySelector('img, script, b')).toBeNull()
  })

  it('has no keyboard trap or axe violations', async () => {
    const user = userEvent.setup()
    const container = renderContent()

    await user.tab()
    expect(container.contains(document.activeElement)).toBe(false)

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })

  it.each(['master', 'superadmin'] as const)(
    'renders only the explicit editable slot for %s without inventing T5 controls',
    (role) => {
      const container = renderContent(
        { ...VISUALIZER_PROFILE, rol: role },
        <p>Composición editable externa</p>,
      )

      expect(within(container).getByText('Composición editable externa')).toBeTruthy()
      expect(container.textContent).not.toContain('Perfil de solo lectura')
      expect(container.querySelector('button, input, form')).toBeNull()
    },
  )

  it('accepts validated profile data and an explicit editable slot', () => {
    expectTypeOf(ProfileContent).parameter(0).toEqualTypeOf<{
      readonly profile: UserResponse
      readonly editableContent: React.ReactNode
    }>()
  })
})
