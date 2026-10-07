import { describe, expect, it } from 'vitest'

import { parseRetryAfter, remainingLockMs } from './retry-after'

const TODAY = new Date('2026-10-07T12:00:00.000Z')
const FALLBACK_UNLOCK_AT = new Date('2026-10-07T12:05:00.000Z')

describe('parseRetryAfter', () => {
  it('adds positive integer seconds to the injected clock', () => {
    expect(parseRetryAfter('90', TODAY)).toEqual(
      new Date('2026-10-07T12:01:30.000Z'),
    )
  })

  it('unlocks immediately for zero seconds', () => {
    expect(parseRetryAfter('0', TODAY)).toEqual(TODAY)
  })

  it.each([
    ['missing', undefined],
    ['unreadable through CORS', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['negative', '-1'],
    ['decimal', '1.5'],
    ['NaN text', 'NaN'],
    ['infinity text', 'Infinity'],
    ['invalid date', 'Wed, 32 Oct 2026 12:00:00 GMT'],
    ['malformed', 'try-again-later'],
  ])('uses the exact five-minute fallback for a %s header', (_case, header) => {
    expect(parseRetryAfter(header, TODAY)).toEqual(FALLBACK_UNLOCK_AT)
  })

  it('respects a valid future HTTP-date', () => {
    expect(parseRetryAfter('Wed, 07 Oct 2026 12:10:00 GMT', TODAY)).toEqual(
      new Date('2026-10-07T12:10:00.000Z'),
    )
  })

  it.each([
    'Wed, 07 Oct 2026 11:59:59 GMT',
    'Wed, 07 Oct 2026 12:00:00 GMT',
  ])('unlocks immediately for an expired HTTP-date %s', (header) => {
    expect(parseRetryAfter(header, TODAY)).toEqual(TODAY)
  })

  it('respects a disproportionately long value when its date is representable', () => {
    const seconds = 1_000_000_000_000

    expect(parseRetryAfter(String(seconds), TODAY)).toEqual(
      new Date(TODAY.getTime() + seconds * 1_000),
    )
  })

  it('falls back safely when seconds would overflow the Date range', () => {
    expect(parseRetryAfter('999999999999999999999999999', TODAY)).toEqual(
      FALLBACK_UNLOCK_AT,
    )
  })
})

describe('remainingLockMs', () => {
  it('returns the remaining milliseconds from the injected clock', () => {
    expect(remainingLockMs(FALLBACK_UNLOCK_AT, TODAY)).toBe(300_000)
  })

  it.each([
    new Date('2026-10-07T12:00:00.000Z'),
    new Date('2026-10-07T11:59:59.999Z'),
  ])('never returns a negative duration for %s', (unlockAt) => {
    expect(remainingLockMs(unlockAt, TODAY)).toBe(0)
  })

  it('returns the safe immediate result for an invalid date', () => {
    expect(remainingLockMs(new Date(Number.NaN), TODAY)).toBe(0)
    expect(remainingLockMs(FALLBACK_UNLOCK_AT, new Date(Number.NaN))).toBe(0)
  })
})
