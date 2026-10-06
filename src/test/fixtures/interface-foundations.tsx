import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Alert } from '../../shared/ui/alert'
import { AsyncState } from '../../shared/ui/async-state'
import { Badge } from '../../shared/ui/badge'
import { Button } from '../../shared/ui/button'
import { Card } from '../../shared/ui/card'
import { FormField } from '../../shared/ui/form-field'
import { Icon } from '../../shared/ui/icon'
import { Modal, type ModalInteractionState } from '../../shared/ui/modal'
import { useToast } from '../../shared/ui/toast-context'
import { ToastProvider } from '../../shared/ui/toast-provider'
import '../../styles/app.css'

function ControlFixture() {
  const { showSuccess } = useToast()

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title level={2}>Controles y formulario</Card.Title>
        <Card.Description>
          Los controles conservan nombre, foco y área táctil en cada ancho.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="grid gap-4">
          <FormField
            id="fixture-email"
            label="Correo electrónico"
            requirement="required"
            help="Usa una dirección válida; el texto extenso debe ajustarse sin ocultar información importante."
            control={
              <input
                type="email"
                placeholder="nombre.muy.largo@ejemplo.empresa"
                data-touch-target
              />
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button.Primary
              data-touch-target
              onClick={() => {
                showSuccess({
                  dedupeKey: 'fixture-save',
                  message: 'Cambios guardados correctamente.',
                })
              }}
            >
              Guardar
            </Button.Primary>
            <Button.Secondary data-touch-target>Cancelar</Button.Secondary>
            <Button.Destructive data-touch-target>Eliminar</Button.Destructive>
            <Button.Icon
              data-touch-target
              icon="icon-edit"
              label="Editar elemento"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="role-superadmin">Superadministrador</Badge>
            <Badge variant="role-master">Master</Badge>
            <Badge variant="role-visualizer">Visualizador</Badge>
            <Badge variant="status-active">Activo</Badge>
            <Icon.Informative name="icon-shield" label="Información protegida" />
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  )
}

function AlertFixture() {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title level={2}>Mensajes</Card.Title>
        <Card.Description>
          Las variantes mantienen texto explícito además del color.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="grid gap-4">
          <Alert.Information>Información contextual disponible.</Alert.Information>
          <Alert.Success>Operación completada correctamente.</Alert.Success>
          <Alert.Error>Revisa los datos ingresados.</Alert.Error>
        </div>
      </Card.Content>
    </Card.Root>
  )
}

function AsyncFixture() {
  return (
    <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="states-title">
      <h2 className="sm:col-span-2 text-xl font-semibold text-brand-heading" id="states-title">
        Estados reutilizables
      </h2>
      <AsyncState.Loading label="Cargando contenido" />
      <AsyncState.Empty
        title="Sin contenido"
        description="Todavía no existen elementos para mostrar."
        titleLevel={3}
        action={<Button.Primary data-touch-target>Crear elemento</Button.Primary>}
      />
      <AsyncState.Error
        title="No pudimos cargar"
        description="Revisa la conexión e inténtalo nuevamente."
        recovery={{
          label: 'Reintentar',
          onRetry: () => undefined,
          state: 'idle',
        }}
      />
      <AsyncState.Unavailable
        title="Servicio no disponible"
        description="Vuelve a intentarlo en unos minutos."
        recovery={{
          label: 'Reintentar',
          onRetry: () => undefined,
          state: 'idle',
        }}
      />
    </section>
  )
}

function ModalFixture() {
  const [open, setOpen] = useState(false)
  const [interactionState, setInteractionState] =
    useState<ModalInteractionState>('idle')

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setInteractionState('idle')
    }
  }

  return (
    <Modal.Root
      open={open}
      onOpenChange={changeOpen}
      interactionState={interactionState}
    >
      <Modal.Trigger variant="secondary">Abrir confirmación</Modal.Trigger>
      <Modal.Content
        title="Confirmar acción"
        description="Revisa la información antes de continuar."
      >
        <p>La operación de esta fixture no modifica datos.</p>
        <Modal.Actions>
          <Modal.Cancel>Cancelar</Modal.Cancel>
          <Modal.Confirm
            variant="primary"
            pendingLabel="Confirmando..."
            onConfirm={() => {
              setInteractionState('pending')
            }}
          >
            Confirmar
          </Modal.Confirm>
        </Modal.Actions>
      </Modal.Content>
    </Modal.Root>
  )
}

export function InterfaceFoundationsFixture() {
  return (
    <ToastProvider>
      <main
        className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 p-4 sm:p-6 lg:p-8"
        data-fixture="interface-foundations"
      >
        <header className="grid gap-2">
          <h1 className="text-3xl font-bold text-brand-heading">
            Fundamentos de interfaz
          </h1>
          <p className="[overflow-wrap:anywhere] text-text-secondary" data-long-text>
            Texto de verificación extremadamente largo:
            usuario.con.nombre.extraordinariamente.extenso@subdominio.interno.ejemplo.empresa
          </p>
        </header>
        <div className="grid gap-6 lg:grid-cols-2" data-layout-grid>
          <ControlFixture />
          <AlertFixture />
        </div>
        <AsyncFixture />
        <div className="flex flex-wrap gap-3">
          <ModalFixture />
        </div>
      </main>
    </ToastProvider>
  )
}

const rootElement = document.getElementById('fixture-root')

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la fixture.')
}

createRoot(rootElement).render(
  <StrictMode>
    <InterfaceFoundationsFixture />
  </StrictMode>,
)
