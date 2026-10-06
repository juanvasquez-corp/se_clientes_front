import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it } from 'vitest'

import { Button } from './button'
import { Card } from './card'

const roots: ReturnType<typeof createRoot>[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('Card', () => {
  it('preserves title, explanation, content and action hierarchy', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    document.body.append(container)

    act(() => {
      root.render(
        <Card.Root>
          <Card.Header>
            <Card.Title level={3}>Información personal</Card.Title>
            <Card.Description>
              Consulta y actualiza tu información.
            </Card.Description>
          </Card.Header>
          <Card.Content>Contenido principal</Card.Content>
          <Card.Actions>
            <Button.Secondary>Cancelar</Button.Secondary>
          </Card.Actions>
        </Card.Root>,
      )
    })

    const heading = screen.getByRole('heading', {
      level: 3,
      name: 'Información personal',
    })
    const description = screen.getByText(
      'Consulta y actualiza tu información.',
    )
    const content = screen.getByText('Contenido principal')
    const action = screen.getByRole('button', { name: 'Cancelar' })

    expect(heading.compareDocumentPosition(description)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(description.compareDocumentPosition(content)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(content.compareDocumentPosition(action)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(heading.tagName).toBe('H3')
  })
})
