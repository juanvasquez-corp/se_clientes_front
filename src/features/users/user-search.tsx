import { zodResolver } from '@hookform/resolvers/zod'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type BaseSyntheticEvent,
} from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Button } from '../../shared/ui/button'
import { FormField } from '../../shared/ui/form-field'
import type { DirectoryState } from './directory-mode'
import {
  userSearchSchema,
  type UserSearchInput,
} from './search-schema'

export type UserSearchFeedback = 'idle' | 'not-found'
export type UserSearchInteractionState = 'idle' | 'pending'

export interface UserSearchProps {
  readonly mode: DirectoryState
  readonly feedback: UserSearchFeedback
  readonly interactionState: UserSearchInteractionState
  readonly onSearch: (input: UserSearchInput) => void | Promise<void>
  readonly onClear: () => void | Promise<void>
}

interface ActiveSubmission {
  readonly email: string
}

function fieldValidation(message: string | undefined) {
  return message === undefined
    ? undefined
    : { message, status: 'error' as const }
}

export function UserSearch({
  mode,
  feedback,
  interactionState,
  onSearch,
  onClear,
}: UserSearchProps) {
  const activeSubmission = useRef<ActiveSubmission | undefined>(undefined)
  const interactionVersion = useRef(0)
  const clearFocusOwner = useRef<number | undefined>(undefined)
  const previousModeKind = useRef(mode.kind)
  const [clearState, setClearState] = useState<'idle' | 'pending'>('idle')
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setFocus,
    setValue,
  } = useForm<
    z.input<typeof userSearchSchema>,
    unknown,
    z.output<typeof userSearchSchema>
  >({
    defaultValues: { email: mode.kind === 'search' ? mode.email : '' },
    resolver: zodResolver(userSearchSchema),
    shouldFocusError: true,
  })
  const isSearching = interactionState === 'pending'

  useLayoutEffect(() => {
    const becameInactive = previousModeKind.current === 'search' && mode.kind === 'list'
    previousModeKind.current = mode.kind
    const owner = clearFocusOwner.current
    if (
      becameInactive &&
      owner !== undefined &&
      interactionVersion.current === owner
    ) {
      clearFocusOwner.current = undefined
      setFocus('email')
    }
  }, [mode.kind, setFocus])

  useEffect(
    () => () => {
      clearFocusOwner.current = undefined
    },
    [],
  )

  const handleValidSearch = async (input: UserSearchInput): Promise<void> => {
    if (
      activeSubmission.current?.email === input.email ||
      (isSearching && mode.kind === 'search' && mode.email === input.email)
    ) {
      return
    }

    const owner = ++interactionVersion.current
    clearFocusOwner.current = undefined
    const submission = { email: input.email }
    activeSubmission.current = submission
    setClearState('idle')
    setValue('email', input.email)
    try {
      await onSearch(input)
    } finally {
      if (
        interactionVersion.current === owner &&
        activeSubmission.current === submission
      ) {
        activeSubmission.current = undefined
      }
    }
  }

  const submitForm = (event: BaseSyntheticEvent) => {
    void handleSubmit(handleValidSearch)(event)
  }

  const clearSearch = async () => {
    if (clearState === 'pending') return

    const owner = ++interactionVersion.current
    clearFocusOwner.current = owner
    activeSubmission.current = undefined
    setClearState('pending')
    clearErrors()
    reset({ email: '' })
    let completed = false
    try {
      await onClear()
      completed = true
    } finally {
      if (interactionVersion.current === owner) {
        setClearState('idle')
        if (!completed) clearFocusOwner.current = undefined
      }
    }
  }

  return (
    <form
      className="grid gap-4"
      aria-busy={isSearching || clearState === 'pending'}
      aria-label="Buscar usuario por correo"
      noValidate
      onSubmit={submitForm}
      role="form"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <FormField
          id="user-search-email"
          label="Correo electrónico"
          requirement="required"
          validation={fieldValidation(errors.email?.message)}
          control={
            <input
              type="email"
              autoComplete="off"
              inputMode="email"
              spellCheck={false}
              {...register('email')}
            />
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button.Primary type="submit">
            {isSearching ? 'Buscando…' : 'Buscar'}
          </Button.Primary>
          {mode.kind === 'search' ? (
            <Button.Secondary
              disabled={clearState === 'pending'}
              onClick={() => {
                void clearSearch()
              }}
            >
              {clearState === 'pending' ? 'Limpiando…' : 'Limpiar'}
            </Button.Secondary>
          ) : null}
        </div>
      </div>
      {feedback === 'not-found' ? (
        <p
          className="rounded-sm border border-border-default bg-surface-page px-4 py-3 text-text-secondary"
          role="status"
          aria-live="polite"
        >
          No existe una cuenta para ese correo.
        </p>
      ) : null}
    </form>
  )
}
