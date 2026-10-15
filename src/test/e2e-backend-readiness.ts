import { z } from 'zod'

interface ReadinessOptions {
  readonly enabled: boolean
  readonly apiBaseUrl: string
}

interface ReadinessDependencies {
  readonly request?: typeof fetch
  readonly now?: () => number
}

type ProbeResult = 'ready' | 'transport' | 'http' | 'json' | 'contract' | 'request-timeout'

const deadlineMs = 10_000
const requestBudgetMs = 1000
// Validación del sobre OpenAPI y del marcador contractual, no de toda la especificación.
const readinessContract = z.object({
  openapi: z.string().regex(/^3\.\d+\.\d+$/u),
  info: z.object({ title: z.string().min(1), version: z.string().min(1) }),
  paths: z.object({
    '/api/auth/login': z.object({
      post: z.object({
        responses: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0),
      }),
    }),
  }),
})

function readinessUrl(apiBaseUrl: string): string {
  try {
    // origin descarta userinfo, path, query y hash antes de cualquier solicitud.
    const base = new URL(apiBaseUrl)
    if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error()
    return new URL('/openapi.json', base.origin).toString()
  } catch {
    throw new Error('E2E_BACKEND_INVALID_ORIGIN.')
  }
}

async function probe(url: string, request: typeof fetch, signal: AbortSignal): Promise<ProbeResult> {
  try {
    const response = await request(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal,
    })
    if (response.status !== 200) {
      await response.body?.cancel()
      return 'http'
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      return 'json'
    }
    return readinessContract.safeParse(body).success ? 'ready' : 'contract'
  } catch {
    return 'transport'
  }
}

async function boundedProbe(url: string, request: typeof fetch, timeoutMs: number): Promise<ProbeResult> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<ProbeResult>((resolve) => {
    timer = setTimeout(() => { resolve('request-timeout') }, timeoutMs)
  })
  try {
    // La carrera incluye lectura del cuerpo y no confía en que el transporte respete abort.
    return await Promise.race([probe(url, request, controller.signal), timeout])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/** Solo E2E: nunca recibe credenciales ni comparte cookies/contexto con Playwright. */
export async function waitForE2EBackend(
  options: ReadinessOptions,
  dependencies: ReadinessDependencies = {},
): Promise<void> {
  if (!options.enabled) return
  const now = dependencies.now ?? (() => performance.now())
  const deadline = now() + deadlineMs
  const url = readinessUrl(options.apiBaseUrl)
  const request = dependencies.request ?? fetch
  let intervalMs = 100
  let diagnostic: Exclude<ProbeResult, 'ready'> | 'deadline' = 'deadline'
  let requestRemaining = deadline - now()
  while (requestRemaining > 0) {
    const result = await boundedProbe(url, request, Math.min(requestBudgetMs, requestRemaining))
    if (result === 'ready' && now() < deadline) return
    diagnostic = result === 'ready' ? 'deadline' : result
    const remaining = deadline - now()
    if (remaining <= 0) break
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)))
    intervalMs = Math.min(intervalMs * 2, 1000)
    requestRemaining = deadline - now()
  }
  throw new Error(`E2E_BACKEND_NOT_READY: ${diagnostic} (${String(deadlineMs)} ms).`)
}
