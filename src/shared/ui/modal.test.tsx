import { act, useState } from 'react'
import axe from 'axe-core'
import { createRoot } from 'react-dom/client'
import { screen, waitFor } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Modal, type ModalInteractionState } from './modal'

const roots: ReturnType<typeof createRoot>[] = []

interface ModalHarnessProps {
  hideTriggerWhileOpen?: boolean
  onConfirm?: () => void
}

function ModalHarness({
  hideTriggerWhileOpen = false,
  onConfirm = () => undefined,
}: ModalHarnessProps) {
  const [open, setOpen] = useState(false)
  const [interactionState, setInteractionState] =
    useState<ModalInteractionState>('idle')
  const [error, setError] = useState<string | null>(null)

  const confirm = () => {
    setInteractionState('pending')
    setError('No pudimos completar la acción.')
    onConfirm()
  }

  return (
    <Modal.Root
      open={open}
      onOpenChange={setOpen}
      interactionState={interactionState}
    >
      {!hideTriggerWhileOpen || !open ? (
        <Modal.Trigger variant="destructive">Eliminar usuario</Modal.Trigger>
      ) : null}
      <Modal.Content
        title="Eliminar usuario"
        description="Esta acción no se puede deshacer."
      >
        <p>¿Deseas continuar?</p>
        {error ? <Modal.Error>{error}</Modal.Error> : null}
        <Modal.Actions>
          <Modal.Cancel>Cancelar</Modal.Cancel>
          <Modal.Confirm
            variant="destructive"
            pendingLabel="Eliminando..."
            onConfirm={confirm}
          >
            Eliminar
          </Modal.Confirm>
        </Modal.Actions>
      </Modal.Content>
    </Modal.Root>
  )
}

function ProgrammaticModal({ open }: { open: boolean }) {
  return (
    <Modal.Root
      open={open}
      onOpenChange={() => undefined}
      interactionState="idle"
    >
      <Modal.Content
        title="Información"
        description="Diálogo abierto programáticamente."
      >
        <Modal.Actions>
          <Modal.Cancel>Cerrar</Modal.Cancel>
        </Modal.Actions>
      </Modal.Content>
    </Modal.Root>
  )
}

function renderModal(modal: React.ReactNode) {
  const container = document.createElement('main')
  const root = createRoot(container)
  roots.push(root)
  document.body.append(container)

  act(() => {
    root.render(modal)
  })

  return { container, root }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
})

describe('Modal', () => {
  it('opens a named native dialog and moves focus to its title', async () => {
    const user = userEvent.setup()
    renderModal(<ModalHarness />)

    await user.click(screen.getByRole('button', { name: 'Eliminar usuario' }))
    const dialog = screen.getByRole<HTMLDialogElement>('dialog', {
      name: 'Eliminar usuario',
      description: 'Esta acción no se puede deshacer.',
    })
    const title = screen.getByRole('heading', {
      level: 2,
      name: 'Eliminar usuario',
    })

    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog.open).toBe(true)
    await waitFor(() => {
      expect(document.activeElement).toBe(title)
    })
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id)
  })

  it('cycles Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup()
    renderModal(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Eliminar usuario' }))
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    const confirm = screen.getByRole('button', { name: 'Eliminar' })

    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.tab()
    expect(document.activeElement).toBe(confirm)
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('closes with Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    renderModal(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'Eliminar usuario' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes through cancel and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    renderModal(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'Eliminar usuario' })

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps context open on error and blocks repeated confirmation or close', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn()
    renderModal(<ModalHarness onConfirm={confirm} />)
    await user.click(screen.getByRole('button', { name: 'Eliminar usuario' }))

    await user.dblClick(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog')
    const error = screen.getByRole('alert')
    const pendingConfirm = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Eliminando...',
    })
    const cancel = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Cancelar',
    })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(dialog).toBeTruthy()
    expect(error.textContent).toContain('No pudimos completar la acción.')
    expect(pendingConfirm.disabled).toBe(true)
    expect(cancel.disabled).toBe(true)
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 2, name: 'Eliminar usuario' }),
      )
    })

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBe(dialog)
  })

  it('degrades safely when the trigger disappears or the dialog unmounts', async () => {
    const user = userEvent.setup()
    const { root } = renderModal(<ModalHarness hideTriggerWhileOpen />)
    await user.click(screen.getByRole('button', { name: 'Eliminar usuario' }))

    expect(() => {
      act(() => {
        root.render(<ProgrammaticModal open={false} />)
      })
    }).not.toThrow()
    expect(document.activeElement).toBe(document.body)

    act(() => {
      root.render(<ProgrammaticModal open />)
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(() => {
      act(() => {
        root.unmount()
      })
    }).not.toThrow()
    roots.splice(roots.indexOf(root), 1)
  })

  it('has no axe violations while open', async () => {
    const user = userEvent.setup()
    const { container } = renderModal(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Eliminar usuario' }))
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
