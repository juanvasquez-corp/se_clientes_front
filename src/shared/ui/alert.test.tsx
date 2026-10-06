import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, describe, expect, it } from 'vitest'

import { Alert } from './alert'

const roots: ReturnType<typeof createRoot>[] = []

function renderAlert(alert: React.ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(alert)
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

describe('Alert', () => {
  it.each([
    [<Alert.Information key="info">Información disponible.</Alert.Information>, 'information'],
    [<Alert.Success key="success">Cambios guardados.</Alert.Success>, 'success'],
    [<Alert.Error key="error">No pudimos guardar.</Alert.Error>, 'error'],
  ])('renders static %s content without an unnecessary live region', (alert, variant) => {
    const container = renderAlert(alert)
    const element = container.querySelector(`[data-variant="${variant}"]`)

    expect(element).toBeTruthy()
    expect(element?.hasAttribute('role')).toBe(false)
    expect(element?.hasAttribute('aria-live')).toBe(false)
  })

  it('announces dynamic status and error messages with appropriate priority', () => {
    renderAlert(
      <>
        <Alert.Success announcement="dynamic">
          Cambios guardados.
        </Alert.Success>
        <Alert.Error announcement="dynamic">
          No pudimos guardar.
        </Alert.Error>
      </>,
    )

    expect(screen.getByRole('status').textContent).toContain('Cambios guardados.')
    expect(screen.getByRole('alert').textContent).toContain('No pudimos guardar.')
  })

  it('renders untrusted-looking messages as text', () => {
    const content = '<img src=x onerror=alert(1)>'
    const container = renderAlert(<Alert.Information>{content}</Alert.Information>)

    expect(screen.getByText(content)).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })
})
