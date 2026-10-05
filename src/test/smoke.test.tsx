import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('renders an accessible heading in jsdom', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    document.body.append(container)

    act(() => {
      root.render(
        <main>
          <h1>Runner verificable</h1>
        </main>,
      )
    })

    expect(
      screen.getByRole('heading', { name: 'Runner verificable' }),
    ).toBeTruthy()

    act(() => {
      root.unmount()
    })
  })
})
