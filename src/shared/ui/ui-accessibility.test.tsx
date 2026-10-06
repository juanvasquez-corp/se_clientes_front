import { act } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import { Alert } from './alert'
import { Button } from './button'
import { Card } from './card'
import { FormField } from './form-field'

describe('shared UI accessibility', () => {
  it('has no axe violations in a representative composition', async () => {
    const container = document.createElement('main')
    const root = createRoot(container)
    document.body.append(container)

    act(() => {
      root.render(
        <Card.Root>
          <Card.Header>
            <Card.Title level={2}>Editar perfil</Card.Title>
            <Card.Description>Actualiza tu información básica.</Card.Description>
          </Card.Header>
          <Card.Content>
            <Alert.Information>
              Tu rol y estado son de solo lectura.
            </Alert.Information>
            <FormField
              id="name"
              label="Nombre"
              requirement="required"
              validation={{
                status: 'error',
                message: 'Ingresa tu nombre.',
              }}
              control={<input type="text" />}
            />
          </Card.Content>
          <Card.Actions>
            <Button.Primary>Guardar cambios</Button.Primary>
          </Card.Actions>
        </Card.Root>,
      )
    })

    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })

    expect(results.violations).toEqual([])

    act(() => {
      root.unmount()
    })
  })
})
