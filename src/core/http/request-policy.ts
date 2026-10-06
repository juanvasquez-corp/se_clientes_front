import type { ApiFailure } from './errors'

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const RELATIVE_BASE_ORIGIN = 'https://relative-api-base.invalid'
const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

const AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/csrf',
  '/api/auth/logout',
])
const STATIC_USER_PATHS = new Set([
  '/api/users',
  '/api/users/create',
  '/api/users/me',
  '/api/users/search',
])
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

interface ParsedApiBase {
  url: URL
  isRelative: boolean
  path: string
}

export function buildJsonBody<const Key extends string, Value>(
  source: Readonly<Record<string, Value | undefined>>,
  allowedKeys: readonly Key[],
): Partial<Record<Key, Value>> {
  const body: Partial<Record<Key, Value>> = {}

  for (const key of allowedKeys) {
    if (RESERVED_KEYS.has(key)) continue

    const value = source[key]
    if (value !== undefined) body[key] = value
  }

  return body
}

export function shouldRetryRead(retryCount: number, failure: ApiFailure): boolean {
  return retryCount === 0 && failure.kind === 'unauthorized'
}

function hasAmbiguousSyntax(value: string): boolean {
  return (
    value.length === 0 ||
    /[\s\\%]/u.test(value) ||
    /(?:^|\/)(?:\.{1,2})(?:\/|$|[?#])/u.test(value)
  )
}

function normalizedBasePath(pathname: string): string {
  if (pathname === '/') return '/'
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

function parseApiBase(baseUrl: string): ParsedApiBase | undefined {
  if (hasAmbiguousSyntax(baseUrl) || baseUrl.includes('?') || baseUrl.includes('#')) {
    return undefined
  }

  const isRelative = baseUrl.startsWith('/')
  if (isRelative && baseUrl.startsWith('//')) return undefined

  try {
    const url = isRelative ? new URL(baseUrl, RELATIVE_BASE_ORIGIN) : new URL(baseUrl)

    if (
      !HTTP_PROTOCOLS.has(url.protocol) ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname.includes('//')
    ) {
      return undefined
    }

    return { url, isRelative, path: normalizedBasePath(url.pathname) }
  } catch {
    return undefined
  }
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/iu.test(value)
}

function isWithinBasePath(pathname: string, basePath: string): boolean {
  return (
    basePath === '/' || pathname === basePath || pathname.startsWith(`${basePath}/`)
  )
}

function combineBasePath(basePath: string, targetPath: string): string {
  const targetWithoutLeadingSlash = targetPath.replace(/^\/+/, '')
  return basePath === '/'
    ? `/${targetWithoutLeadingSlash}`
    : `${basePath}/${targetWithoutLeadingSlash}`
}

function isKnownUserPath(pathname: string): boolean {
  if (STATIC_USER_PATHS.has(pathname)) return true

  const segments = pathname.split('/')
  if (segments.length !== 4 && segments.length !== 5) return false
  if (segments[1] !== 'api' || segments[2] !== 'users') return false

  const userUuid = segments[3]
  if (userUuid === undefined || !UUID_PATH_SEGMENT.test(userUuid)) return false

  return segments.length === 4 || segments[4] === 'status'
}

function hasAllowedQuery(url: URL): boolean {
  if (url.search.length === 0) return true
  if (url.pathname !== '/api/users') return false

  const seen = new Set<string>()
  for (const [key, value] of url.searchParams) {
    if ((key !== 'page' && key !== 'size') || seen.has(key) || !/^\d+$/u.test(value)) {
      return false
    }
    seen.add(key)
  }

  return true
}

export function isKnownApiTarget(baseUrl: string, target: string): boolean {
  const base = parseApiBase(baseUrl)
  if (
    base === undefined ||
    hasAmbiguousSyntax(target) ||
    target.startsWith('//') ||
    target.includes('#')
  ) {
    return false
  }

  const targetIsAbsolute = isAbsoluteUrl(target)
  if (base.isRelative && targetIsAbsolute) return false

  try {
    const parsedTarget = targetIsAbsolute
      ? new URL(target)
      : new URL(target, RELATIVE_BASE_ORIGIN)

    if (
      !HTTP_PROTOCOLS.has(parsedTarget.protocol) ||
      parsedTarget.username.length > 0 ||
      parsedTarget.password.length > 0 ||
      parsedTarget.pathname.includes('//')
    ) {
      return false
    }

    if (targetIsAbsolute) {
      if (
        parsedTarget.origin !== base.url.origin ||
        !isWithinBasePath(parsedTarget.pathname, base.path)
      ) {
        return false
      }
    } else if (!isWithinBasePath(parsedTarget.pathname, base.path)) {
      parsedTarget.pathname = combineBasePath(base.path, parsedTarget.pathname)
    }

    return (
      (AUTH_PATHS.has(parsedTarget.pathname) || isKnownUserPath(parsedTarget.pathname)) &&
      hasAllowedQuery(parsedTarget)
    )
  } catch {
    return false
  }
}
