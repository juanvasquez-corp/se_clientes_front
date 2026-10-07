const FALLBACK_LOCK_MS = 5 * 60 * 1_000
const MAX_DATE_MS = 8_640_000_000_000_000
const INTEGER_SECONDS_PATTERN = /^\d+$/

function fallbackUnlockAt(nowMs: number): Date {
  return new Date(Math.min(nowMs + FALLBACK_LOCK_MS, MAX_DATE_MS))
}

function parseHttpDate(header: string): number | undefined {
  const parsedMs = Date.parse(header)
  if (!Number.isFinite(parsedMs)) return undefined

  const parsedDate = new Date(parsedMs)
  return parsedDate.toUTCString() === header ? parsedMs : undefined
}

/**
 * Devuelve siempre una fecha válida si `today` es válido. Entradas inválidas o que
 * exceden el rango de Date usan el fallback; cerca del máximo representable se limita
 * al último instante válido para no producir Invalid Date.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  today: Date,
): Date {
  const nowMs = today.getTime()
  if (!Number.isFinite(nowMs)) {
    throw new RangeError('El reloj de referencia debe contener una fecha válida.')
  }

  if (header === null || header === undefined || header.length === 0) {
    return fallbackUnlockAt(nowMs)
  }

  if (INTEGER_SECONDS_PATTERN.test(header)) {
    const targetMs = BigInt(nowMs) + BigInt(header) * 1_000n
    if (targetMs > BigInt(MAX_DATE_MS)) return fallbackUnlockAt(nowMs)

    return new Date(Number(targetMs))
  }

  const parsedMs = parseHttpDate(header)
  if (parsedMs === undefined) return fallbackUnlockAt(nowMs)

  return new Date(Math.max(parsedMs, nowMs))
}

/** Devuelve cero ante fechas vencidas o inválidas; nunca NaN ni un valor negativo. */
export function remainingLockMs(unlockAt: Date, today: Date): number {
  const unlockAtMs = unlockAt.getTime()
  const nowMs = today.getTime()
  if (!Number.isFinite(unlockAtMs) || !Number.isFinite(nowMs)) return 0

  return Math.max(0, unlockAtMs - nowMs)
}
