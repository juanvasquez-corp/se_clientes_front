/// <reference types="node" />

import { readFile, readdir } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCssPath = resolve('src/styles/app.css')
const tokenCssPath = resolve('public/assets/brand-tokens.css')
const formFieldPath = resolve('src/shared/ui/form-field.tsx')

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name)

      return entry.isDirectory() ? await collectSourceFiles(path) : [path]
    }),
  )

  return files.flat()
}

function readToken(css: string, token: string): string {
  const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1]

  if (!value) {
    throw new Error(`No se encontró el token ${token}.`)
  }

  return value
}

function relativeLuminance(hex: string): number {
  if (!/^#[\da-f]{6}$/i.test(hex)) {
    throw new Error('El color debe usar seis dígitos hexadecimales.')
  }

  const linearize = (channel: string) => {
    const value = Number.parseInt(channel, 16) / 255

    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  }

  const red = linearize(hex.slice(1, 3))
  const green = linearize(hex.slice(3, 5))
  const blue = linearize(hex.slice(5, 7))

  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

function placeholderTokenForClass(className: string): string {
  if (className === 'text-text-muted') {
    return '--aliar-gray-500'
  }

  if (className === 'text-text-secondary') {
    return '--aliar-gray-700'
  }

  throw new Error(`Clase semántica de placeholder no aprobada: ${className}.`)
}

describe('application visual foundations', () => {
  it('uses the approved type stack and semantic base states', async () => {
    const css = await readFile(appCssPath, 'utf8')

    expect(css).toMatch(/--font-sans:\s*Inter,\s*system-ui,/)
    expect(css).toMatch(/box-sizing:\s*border-box/)
    expect(css).toMatch(/font:\s*inherit/)
    expect(css).toMatch(/:disabled[\s\S]*cursor:\s*not-allowed/)
    expect(css).toMatch(/body[\s\S]*line-height:\s*1\.5/)
  })

  it('provides a visible global keyboard focus using an approved token', async () => {
    const css = await readFile(appCssPath, 'utf8')

    expect(css).toMatch(
      /:focus-visible[\s\S]*outline:\s*3px solid var\(--aliar-blue-600\)/,
    )
    expect(css).toMatch(/:focus-visible[\s\S]*outline-offset:\s*2px/)
  })

  it('reduces non-essential motion when the user requests it', async () => {
    const css = await readFile(appCssPath, 'utf8')

    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toMatch(
      /prefers-reduced-motion:[\s\S]*animation-duration:\s*0\.01ms !important/,
    )
    expect(css).toMatch(
      /prefers-reduced-motion:[\s\S]*transition-duration:\s*0\.01ms !important/,
    )
    expect(css).toMatch(
      /prefers-reduced-motion:[\s\S]*scroll-behavior:\s*auto !important/,
    )
  })

  it('keeps focus and base text contrast at WCAG AA levels', async () => {
    const tokens = await readFile(tokenCssPath, 'utf8')
    const focus = readToken(tokens, '--aliar-blue-600')
    const page = readToken(tokens, '--aliar-gray-100')
    const card = readToken(tokens, '--aliar-white')
    const text = readToken(tokens, '--aliar-gray-950')

    expect(contrastRatio(focus, page)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(focus, card)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(text, page)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps visible placeholder text at WCAG AA contrast', async () => {
    const [tokens, formFieldSource] = await Promise.all([
      readFile(tokenCssPath, 'utf8'),
      readFile(formFieldPath, 'utf8'),
    ])
    const placeholderClass = /placeholder:(text-text-[a-z-]+)/.exec(
      formFieldSource,
    )?.[1]

    if (!placeholderClass) {
      throw new Error('FormField no define una clase semántica para el placeholder.')
    }

    const placeholder = readToken(
      tokens,
      placeholderTokenForClass(placeholderClass),
    )
    const controlBackground = readToken(tokens, '--aliar-white')

    expect(contrastRatio(placeholder, controlBackground)).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('does not embed raw hex colors in application sources', async () => {
    const sourceFiles = (await collectSourceFiles(resolve('src'))).filter((path) =>
      ['.css', '.ts', '.tsx'].includes(extname(path)),
    )
    const sources = await Promise.all(
      sourceFiles
        .filter((path) => path !== appCssPath)
        .map(async (path) => ({ path, source: await readFile(path, 'utf8') })),
    )

    for (const { path, source } of sources) {
      expect(source, path).not.toMatch(/#[\da-f]{3,8}\b/i)
    }

    expect(await readFile(appCssPath, 'utf8')).not.toMatch(/#[\da-f]{3,8}\b/i)
  })
})
