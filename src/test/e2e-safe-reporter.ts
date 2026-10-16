import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { basename } from 'node:path'

const safeDiagnostic = /^(?:Error: )?(E2E_BACKEND_NOT_READY: (?:transport|http|json|contract|request-timeout|deadline) \(10000 ms\)\.|E2E_BACKEND_INVALID_ORIGIN\.)$/u
const knownSuites = new Set([
  'login-real.e2e.ts', 'session.spec.ts', 'profile.e2e.ts', 'users-directory.e2e.ts',
  'user-detail.e2e.ts', 'login-page.e2e.ts', 'navigation.e2e.ts', 'bootstrap.e2e.ts',
  'interface-foundations.e2e.ts', 'lazy-route-error.e2e.ts',
])

/** Reporta fallos sin títulos, valores de aserción, stacks, adjuntos ni salida del navegador. */
export default class E2ESafeReporter implements Reporter {
  private readonly counts = { passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0 }

  printsToStdio(): boolean { return true }

  onStdOut(): void { /* Se descartan los datos no confiables, no el resultado. */ }
  onStdErr(): void { /* Incluye salida de servidores y de workers. */ }

  onError(): void {
    console.log('E2E runner: failed (diagnóstico privado omitido).')
  }

  onTestEnd(
    test: Pick<TestCase, 'location'>,
    result: Pick<TestResult, 'status' | 'errors'>,
  ): void {
    this.counts[result.status] += 1
    const name = basename(test.location.file)
    const suite = knownSuites.has(name) ? name : 'test'
    console.log(`E2E ${suite}:${String(test.location.line)}: ${result.status}`)
    for (const error of result.errors) {
      const diagnostic = safeDiagnostic.exec(error.message ?? '')?.[1]
      if (diagnostic !== undefined) console.log(diagnostic)
    }
  }

  onEnd(result: Pick<FullResult, 'status'>): void {
    console.log(`E2E result: ${result.status}; ${JSON.stringify(this.counts)}`)
    // Sin devolver status: Playwright conserva su código de salida original.
  }
}
