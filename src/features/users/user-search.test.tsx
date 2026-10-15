import { CancelledError, QueryClient } from '@tanstack/react-query'
import { act, useRef, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { HttpResponse, delay, http } from 'msw'
import { screen, waitFor, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApiClient } from '../../core/http/api-client'
import { server } from '../../test/server'
import {
  createDirectoryQueryController,
  usersDirectoryQueryOptions,
} from './users-query'
import { createUsersApi, type UsersApi } from './users-api'
import type { DirectoryQueryController } from './users-query'
import type { DirectoryState } from './directory-mode'
import { userDirectoryQueryKey } from './user-query-keys'
import { UserSearch, type UserSearchFeedback } from './user-search'
import type { UserSearchInput } from './search-schema'

const API_BASE_URL = 'https://api.example.test/api'
const SEARCH_URL = `${API_BASE_URL}/users/search`
const ACCOUNT_UUID = '2f1f7a2e-46f5-4c8a-b47d-524f1f2e1c75'
const SEARCH_RESULT = {
  uuid: 'f55e8c53-f579-4134-980b-84c95acb18ce',
  name: 'Ana',
  last_name: 'López',
  email: 'ana@example.com',
  phone_number: null,
  rol: 'master',
  is_active: true,
} as const

const roots: Root[] = []
const queryClients: QueryClient[] = []

async function render(component: ReactNode) {
  const container = document.createElement('main')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(component)
    await Promise.resolve()
  })
  return container
}

function listMode(page = 3): DirectoryState {
  return { kind: 'list', page, size: 10 }
}

function createTestUsersApi(): UsersApi {
  return createUsersApi({
    apiClient: createApiClient({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => 'search-access-value',
      sessionRecovery: { recoverRead: () => Promise.resolve('dead') },
    }),
  })
}

interface IntegrationHarnessProps {
  readonly api: UsersApi
  readonly controller: DirectoryQueryController
  readonly queryClient: QueryClient
}

function IntegrationHarness({ api, controller, queryClient }: IntegrationHarnessProps) {
  const [mode, setMode] = useState<DirectoryState>(controller.getState())
  const [feedback, setFeedback] = useState<UserSearchFeedback>('idle')
  const [interactionState, setInteractionState] = useState<'idle' | 'pending'>('idle')
  const [content, setContent] = useState('Listado paginado')
  const generation = useRef(0)

  const search = async (input: UserSearchInput) => {
    const currentGeneration = ++generation.current
    setInteractionState('pending')
    setFeedback('idle')
    const searchMode = await controller.submitSearch(input.email)
    setMode(searchMode)
    setContent('Buscando usuario')

    try {
      const outcome = await queryClient.query(
        usersDirectoryQueryOptions(api, ACCOUNT_UUID, searchMode),
      )
      if (generation.current !== currentGeneration) return
      if (outcome.kind === 'not-found') {
        setFeedback('not-found')
        setContent('Sin resultado')
      } else if (outcome.kind === 'success' && 'email' in outcome.data) {
        setContent(`Resultado ${outcome.data.email}`)
      }
    } catch (error: unknown) {
      if (!(error instanceof CancelledError)) throw error
    } finally {
      if (generation.current === currentGeneration) setInteractionState('idle')
    }
  }

  const clear = async () => {
    generation.current += 1
    const restored = await controller.clearSearch()
    if (restored.kind !== 'list') throw new Error('Expected the preserved list mode.')
    setMode(restored)
    setFeedback('idle')
    setInteractionState('idle')
    setContent(`Listado página ${String(restored.page)}`)
  }

  return (
    <>
      <UserSearch
        mode={mode}
        feedback={feedback}
        interactionState={interactionState}
        onSearch={search}
        onClear={clear}
      />
      <p data-testid="directory-content">{content}</p>
      <output data-testid="directory-mode">
        {mode.kind === 'list' ? `list:${String(mode.page)}` : `search:${mode.email}`}
      </output>
    </>
  )
}

async function createIntegrationFixture(page = 3) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClients.push(queryClient)
  const controller = createDirectoryQueryController({
    queryClient,
    accountUuid: ACCOUNT_UUID,
    initial: { page, size: 10 },
  })
  const api = createTestUsersApi()
  const container = await render(
    <IntegrationHarness api={api} controller={controller} queryClient={queryClient} />,
  )
  return { api, container, controller, queryClient }
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
    await Promise.all(queryClients.map((client) => client.cancelQueries()))
  })
  for (const client of queryClients.splice(0)) client.clear()
})

describe('UserSearch', () => {
  it('renders only exact-email search controls and no unsupported filters', async () => {
    const container = await render(
      <UserSearch
        mode={listMode()}
        feedback="idle"
        interactionState="idle"
        onSearch={() => undefined}
        onClear={() => undefined}
      />,
    )

    const form = screen.getByRole('form', { name: 'Buscar usuario por correo' })
    const input = within(form).getByRole<HTMLInputElement>('textbox', {
      name: /correo electrónico.*obligatorio/iu,
    })
    expect(within(form).getAllByRole('textbox')).toHaveLength(1)
    expect(within(form).getAllByRole('button')).toHaveLength(1)
    expect(within(form).getByRole('button', { name: 'Buscar' })).toBeTruthy()
    expect(input.type).toBe('email')
    expect(input.autocomplete).toBe('off')
    expect(container.textContent).not.toMatch(/rol|estado|nombre|cédula|ordenar|filtro/iu)
  })

  it.each([
    ['', 'Ingresa tu correo electrónico.'],
    ['correo-parcial', 'Ingresa un correo electrónico válido.'],
  ])('focuses and reports invalid value %o without interaction', async (value, message) => {
    const onSearch = vi.fn()
    const onClear = vi.fn()
    await render(
      <UserSearch
        mode={listMode()}
        feedback="idle"
        interactionState="idle"
        onSearch={onSearch}
        onClear={onClear}
      />,
    )
    const user = userEvent.setup()
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: /correo electrónico/iu })
    if (value.length > 0) await act(async () => { await user.type(input, value) })

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })

    const error = await screen.findByText(message)
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
    expect(onSearch).not.toHaveBeenCalled()
    expect(onClear).not.toHaveBeenCalled()
  })

  it('normalizes one valid submit and blocks an identical pending duplicate', async () => {
    let resolveSearch: (() => void) | undefined
    const onSearch = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSearch = resolve
      }),
    )
    await render(
      <UserSearch
        mode={listMode()}
        feedback="idle"
        interactionState="pending"
        onSearch={onSearch}
        onClear={() => undefined}
      />,
    )
    const user = userEvent.setup()
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: /correo electrónico/iu })
    await act(async () => { await user.type(input, '  ANA@Example.COM  ') })

    await act(async () => { await user.dblClick(screen.getByRole('button', { name: 'Buscando…' })) })

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith({ email: 'ana@example.com' })
    expect(input.value).toBe('ana@example.com')
    await act(async () => {
      resolveSearch?.()
      await Promise.resolve()
    })
  })

  it('shows typed not-found feedback without a global alert or backend text', async () => {
    await render(
      <UserSearch
        mode={{
          kind: 'search',
          email: 'missing@example.com',
          preservedPage: 3,
          size: 10,
        }}
        feedback="not-found"
        interactionState="idle"
        onSearch={() => undefined}
        onClear={() => undefined}
      />,
    )

    expect(screen.getByRole('status').textContent).toBe(
      'No existe una cuenta para ese correo.',
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toMatch(/usuario no encontrado|detail/iu)
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
  })

  it('sends one exact normalized POST and replaces list content with the result', async () => {
    let requests = 0
    server.use(
      http.post(SEARCH_URL, async ({ request }) => {
        requests += 1
        expect(new URL(request.url).search).toBe('')
        expect(await request.json()).toEqual({ email: 'ana@example.com' })
        return HttpResponse.json(SEARCH_RESULT)
      }),
    )
    await createIntegrationFixture()
    const user = userEvent.setup()
    await act(async () => { await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/iu }),
      ' ANA@EXAMPLE.COM ',
    ) })

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })

    expect(await screen.findByText('Resultado ana@example.com')).toBeTruthy()
    expect(screen.getByTestId('directory-mode').textContent).toBe('search:ana@example.com')
    expect(requests).toBe(1)
  })

  it('maps search 404 to local no-result feedback without navigation', async () => {
    server.use(
      http.post(SEARCH_URL, () =>
        HttpResponse.json({ detail: 'Mensaje crudo del backend' }, { status: 404 }),
      ),
    )
    await createIntegrationFixture()
    const user = userEvent.setup()
    await act(async () => { await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/iu }),
      'missing@example.com',
    ) })

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })

    expect(await screen.findByText('No existe una cuenta para ese correo.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toContain('Mensaje crudo del backend')
  })

  it('clears an active delayed search, aborts it and restores the preserved page', async () => {
    let requestStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve
    })
    let requests = 0
    server.use(
      http.post(SEARCH_URL, async () => {
        requests += 1
        requestStarted?.()
        await delay('infinite')
        return HttpResponse.json(SEARCH_RESULT)
      }),
    )
    const { queryClient } = await createIntegrationFixture(4)
    const user = userEvent.setup()
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: /correo electrónico/iu })
    await act(async () => { await user.type(input, 'ana@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })
    await started

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Limpiar' })) })

    await waitFor(() => {
      expect(screen.getByTestId('directory-mode').textContent).toBe('list:4')
      expect(screen.getByTestId('directory-content').textContent).toBe('Listado página 4')
    })
    expect(input.value).toBe('')
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    expect(requests).toBe(1)
    expect(queryClient.getQueryData(userDirectoryQueryKey(ACCOUNT_UUID, {
      kind: 'search',
      email: 'ana@example.com',
      preservedPage: 4,
      size: 10,
    }))).toBeUndefined()
  })

  it('drops pending clear focus intent when unmounted', async () => {
    let resolveClear: (() => void) | undefined
    const onClear = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveClear = resolve
      }),
    )
    await render(
      <UserSearch
        mode={{
          kind: 'search',
          email: 'ana@example.com',
          preservedPage: 1,
          size: 10,
        }}
        feedback="idle"
        interactionState="idle"
        onSearch={() => undefined}
        onClear={onClear}
      />,
    )
    const outside = document.createElement('button')
    document.body.append(outside)
    const user = userEvent.setup()
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Limpiar' })) })
    outside.focus()
    const root = roots.pop()
    if (root === undefined) throw new Error('Expected mounted search root.')
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })

    await act(async () => {
      resolveClear?.()
      await Promise.resolve()
    })

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(outside)
  })

  it('lets a new exact email abort and replace the previous search', async () => {
    let firstStartedRequest: (() => void) | undefined
    const firstStarted = new Promise<void>((resolve) => {
      firstStartedRequest = resolve
    })
    const bodies: unknown[] = []
    server.use(
      http.post(SEARCH_URL, async ({ request }) => {
        const body = await request.json()
        bodies.push(body)
        if (bodies.length === 1) {
          firstStartedRequest?.()
          await delay('infinite')
        }
        return HttpResponse.json({ ...SEARCH_RESULT, email: 'bea@example.com' })
      }),
    )
    await createIntegrationFixture()
    const user = userEvent.setup()
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: /correo electrónico/iu })
    await act(async () => { await user.type(input, 'ana@example.com') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscar' })) })
    await firstStarted
    await waitFor(() => {
      expect(screen.getByTestId('directory-mode').textContent).toBe('search:ana@example.com')
    })
    await act(async () => { await user.clear(input) })
    await act(async () => { await user.type(input, 'bea@example.com') })
    expect(input.value).toBe('bea@example.com')

    await act(async () => { await user.click(screen.getByRole('button', { name: 'Buscando…' })) })

    expect(await screen.findByText('Resultado bea@example.com')).toBeTruthy()
    expect(bodies).toEqual([
      { email: 'ana@example.com' },
      { email: 'bea@example.com' },
    ])
    expect(screen.getByTestId('directory-mode').textContent).toBe('search:bea@example.com')
  })

  it('supports keyboard use and has no axe violations with validation feedback', async () => {
    const container = await render(
      <UserSearch
        mode={listMode()}
        feedback="idle"
        interactionState="idle"
        onSearch={() => undefined}
        onClear={() => undefined}
      />,
    )
    const user = userEvent.setup()
    const input = screen.getByRole('textbox', { name: /correo electrónico/iu })

    await act(async () => { await user.tab() })
    expect(document.activeElement).toBe(input)
    await act(async () => { await user.keyboard('{Enter}') })
    await screen.findByText('Ingresa tu correo electrónico.')
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
