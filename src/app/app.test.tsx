import { act } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'

import { App } from './app'
import { AppProviders } from './providers'
import { createTestQueryClient } from '../test/create-test-query-client'

function QueryProviderProbe() {
  useQueryClient()

  return <p>Proveedor de consultas disponible</p>
}

describe('application bootstrap', () => {
  it('renders the application inside its providers', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const queryClient = createTestQueryClient()
    document.body.append(container)

    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false)

    act(() => {
      root.render(
        <AppProviders queryClient={queryClient}>
          <App />
          <QueryProviderProbe />
        </AppProviders>,
      )
    })

    expect(
      screen.getByRole('heading', { name: 'Gestión de usuarios' }),
    ).toBeTruthy()
    expect(screen.getByText('Proveedor de consultas disponible')).toBeTruthy()

    act(() => {
      root.unmount()
    })
  })
})
