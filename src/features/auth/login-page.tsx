import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand/react'

import type { LoginOutcome } from '../../core/session/auth-api'
import type {
  SessionIdentity,
  SessionStore,
} from '../../core/session/session-store'
import { LoginForm } from './login-form'
import {
  homeForRole,
  type LoginNavigationPort,
} from './login-navigation'
import type { LoginInput } from './login-schema'
import './login-page.css'

interface LoginPageProps {
  readonly navigation: LoginNavigationPort
  readonly now?: () => Date
  readonly onSubmit: (input: LoginInput) => Promise<LoginOutcome>
  readonly sessionStore: SessionStore
}

export function LoginPage({ navigation, now, onSubmit, sessionStore }: LoginPageProps) {
  const navigationDelivered = useRef(false)
  const [acceptedIdentity, setAcceptedIdentity] = useState<
    SessionIdentity | undefined
  >()
  const sessionIdentity = useStore(sessionStore, (state) =>
    state.status === 'authenticated' ? state.identity : undefined,
  )
  const identity = sessionIdentity ?? acceptedIdentity

  const submitLogin = async (input: LoginInput): Promise<LoginOutcome> => {
    const outcome = await onSubmit(input)
    if (outcome.kind === 'authenticated') setAcceptedIdentity(outcome.identity)
    return outcome
  }

  useEffect(() => {
    if (identity === undefined || navigationDelivered.current) return

    navigationDelivered.current = true
    navigation.replace(homeForRole(identity.role))
  }, [identity, navigation])

  if (identity !== undefined) return null

  return (
    <main className="login-page">
      <div className="login-page__layout">
        <section
          className="login-page__card"
          aria-describedby="login-page-description"
          aria-labelledby="login-page-title"
        >
          <img
            className="login-page__logo"
            src="/assets/aliar-logo.svg"
            alt="Aliar S.A."
            width="200"
            height="65"
          />
          <header className="login-page__header">
            <h1 id="login-page-title">Inicia sesión</h1>
            <p id="login-page-description">
              Ingresa tus credenciales para continuar.
            </p>
          </header>
          <LoginForm now={now} onSubmit={submitLogin} />
        </section>
      </div>
    </main>
  )
}
