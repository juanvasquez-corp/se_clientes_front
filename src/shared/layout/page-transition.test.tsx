/// <reference types="node" />

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { PageTransition } from './page-transition'

const roots: ReturnType<typeof createRoot>[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('PageTransition', () => {
  it('renders page content when the browser has no transition implementation', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <PageTransition>
          <main>Contenido</main>
        </PageTransition>,
      )
    })
    expect(container.textContent).toBe('Contenido')
  })

  it('uses only the stable React export, default none and reduced-motion CSS', async () => {
    const wrapper = await readFile(
      resolve('src/shared/layout/page-transition.tsx'),
      'utf8',
    )
    const globalStyles = await readFile(resolve('src/styles/app.css'), 'utf8')
    const layoutSources = await Promise.all(
      ['app-shell.tsx', 'sidebar.tsx', 'mobile-menu.tsx'].map((file) =>
        readFile(resolve('src/shared/layout', file), 'utf8'),
      ),
    )

    expect(wrapper).toMatch(
      /import\s*\{[^}]*\bViewTransition\b[^}]*\}\s*from\s*['"]react['"]/,
    )
    expect(wrapper).toContain('default="none"')
    expect(/\benter=/.test(wrapper)).toBe(/\bexit=/.test(wrapper))
    expect(wrapper).not.toMatch(/canary|experimental|react\/experimental/i)
    expect(layoutSources.join('\n')).not.toContain('ViewTransition')
    expect(globalStyles).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(globalStyles).toContain('::view-transition-old(*)')
    expect(globalStyles).toContain('::view-transition-new(*)')
  })
})
