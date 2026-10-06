import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Skeleton } from './skeleton'

const roots: ReturnType<typeof createRoot>[] = []

function renderSkeleton(skeleton: React.ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(skeleton)
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

describe('Skeleton', () => {
  it('renders decorative fixed-size shapes that stop animating for reduced motion', () => {
    const container = renderSkeleton(
      <>
        <Skeleton.Avatar />
        <Skeleton.Line width="full" />
        <Skeleton.Line width="half" />
        <Skeleton.Field />
      </>,
    )
    const skeletons = [...container.querySelectorAll('[data-skeleton]')]

    expect(skeletons).toHaveLength(4)
    for (const skeleton of skeletons) {
      expect(skeleton.getAttribute('aria-hidden')).toBe('true')
      expect(skeleton.classList.contains('animate-pulse')).toBe(true)
      expect(skeleton.classList.contains('motion-reduce:animate-none')).toBe(true)
    }
    expect(skeletons[0]?.classList.contains('size-12')).toBe(true)
    expect(skeletons[1]?.classList.contains('h-4')).toBe(true)
    expect(skeletons[3]?.classList.contains('h-11')).toBe(true)
  })
})
