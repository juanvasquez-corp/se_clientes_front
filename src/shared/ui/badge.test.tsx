import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'

import { Badge, type BadgeVariant } from './badge'

const cases: readonly {
  label: string
  variant: BadgeVariant
  expectedClasses: string[]
}[] = [
  {
    label: 'Superadministrador',
    variant: 'role-superadmin',
    expectedClasses: ['bg-brand-soft', 'text-brand-primary'],
  },
  {
    label: 'Master',
    variant: 'role-master',
    expectedClasses: ['bg-brand-info', 'text-brand-link'],
  },
  {
    label: 'Visualizador',
    variant: 'role-visualizer',
    expectedClasses: ['bg-surface-page', 'text-text-secondary'],
  },
  {
    label: 'Activo',
    variant: 'status-active',
    expectedClasses: ['bg-brand-soft', 'text-brand-primary'],
  },
  {
    label: 'Inactivo',
    variant: 'status-inactive',
    expectedClasses: ['bg-status-danger/10', 'text-status-danger'],
  },
]

function renderBadge(label: string, variant: BadgeVariant) {
  const container = document.createElement('div')
  const root = createRoot(container)
  document.body.append(container)

  act(() => {
    root.render(<Badge variant={variant}>{label}</Badge>)
  })

  return { container, root }
}

describe('Badge', () => {
  it.each(cases)(
    'renders $variant with its semantic token classes',
    ({ label, variant, expectedClasses }) => {
      const { root } = renderBadge(label, variant)
      const badge = screen.getByText(label)

      expect(badge.tagName).toBe('SPAN')
      expect(badge.getAttribute('data-variant')).toBe(variant)
      for (const className of expectedClasses) {
        expect(badge.classList.contains(className)).toBe(true)
      }

      act(() => {
        root.unmount()
      })
    },
  )

  it('adds a decorative dot only to status variants', () => {
    const active = renderBadge('Activo', 'status-active')

    expect(active.container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    act(() => {
      active.root.unmount()
    })

    const role = renderBadge('Master', 'role-master')

    expect(role.container.querySelector('[aria-hidden="true"]')).toBeNull()
    act(() => {
      role.root.unmount()
    })
  })

  it('renders untrusted-looking content as text', () => {
    const content = '<img src=x onerror=alert(1)>'
    const { container, root } = renderBadge(content, 'role-visualizer')

    expect(screen.getByText(content)).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()

    act(() => {
      root.unmount()
    })
  })
})
