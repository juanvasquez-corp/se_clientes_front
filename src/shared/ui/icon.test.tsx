/// <reference types="node" />

import { act } from 'react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import { ICON_IDS, type IconName } from './icon-names'
import { Icon } from './icon'

const roots: ReturnType<typeof createRoot>[] = []

function renderIcon(icon: React.ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(icon)
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

describe('Icon', () => {
  it('keeps its typed whitelist aligned with every approved sprite symbol', async () => {
    const sprite = await readFile(resolve('public/assets/icons.svg'), 'utf8')
    const spriteIds = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(
      (match) => match[1],
    )

    expect(ICON_IDS).toEqual(spriteIds)
    expectTypeOf<IconName>().toEqualTypeOf<(typeof ICON_IDS)[number]>()
  })

  it('renders a decorative sprite icon hidden from assistive technology', () => {
    const container = renderIcon(<Icon.Decorative name="icon-users" />)
    const svg = container.querySelector('svg')
    const use = container.querySelector('use')

    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('focusable')).toBe('false')
    expect(use?.getAttribute('href')).toBe('/assets/icons.svg#icon-users')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('gives informative icons an explicit accessible name', () => {
    const container = renderIcon(
      <Icon.Informative name="icon-shield" label="Cuenta protegida" />,
    )
    const image = screen.getByRole('img', { name: 'Cuenta protegida' })

    expect(image.tagName).toBe('svg')
    expect(container.querySelector('use')?.getAttribute('href')).toBe(
      '/assets/icons.svg#icon-shield',
    )
    expect(image.hasAttribute('aria-hidden')).toBe(false)
  })
})
