import { useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'

import { LoginPage } from '../../features/auth/login-page'
import type { LoginNavigationPort } from '../../features/auth/login-navigation'
import { PageTransition } from '../../shared/layout/page-transition'

export function LoginRoute() {
  const router = useRouter()
  const navigation = useMemo<LoginNavigationPort>(
    () => ({
      replace(destination) {
        void router.navigate({
          to: destination,
          replace: true,
          search: {},
          hash: '',
        })
      },
    }),
    [router],
  )

  return (
    <PageTransition>
      <LoginPage
        navigation={navigation}
        onSubmit={router.options.context.session.login}
        sessionStore={router.options.context.session.store}
      />
    </PageTransition>
  )
}
