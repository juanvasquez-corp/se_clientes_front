/// <reference types="node" />

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const assetHashes = {
  'aliar-logo.svg':
    '28acc36347788fbd3671910dc1b41efe3eedcf203690307c46ac599bf81a555d',
  'aliar-symbol.svg':
    '96bccd6c9873179c371a4f5dbeddd1db57f3fda4edd44e1c6c9aa53fd009b61d',
  'brand-tokens.css':
    'a18a97a2473389060a97cdf4ebc8c249902ff49cfadb6e16f26f96ef20f24b66',
  'brand-waves.svg':
    '260113336cce2d639332e90483f02364712fac6556fd69eed5dc5cd594f3be29',
  'favicon.svg':
    '49bdbd29dc907dc720ee731c207064486cfa4ef68cc6909bb5d854f4ddd8b865',
  'icons.svg':
    '866462d28ad79a0d5366963db293563485b4a6d7c0a5b4d9c253ce4b5daa7e41',
  'login-background-mobile.webp':
    '09718411026fbf5749665a44b7d251031833713f8a37f6d90c953266e8beb610',
  'login-background.webp':
    '48c8ac82fad7986c804844fa830b6791ff7df44d93710d62be97f41850d8b2d0',
} as const

describe('Aliar public assets', () => {
  it.each(Object.entries(assetHashes))(
    'preserves %s byte-for-byte',
    async (fileName, expectedHash) => {
      const asset = await readFile(resolve('public/assets', fileName))
      const actualHash = createHash('sha256').update(asset).digest('hex')

      expect(actualHash).toBe(expectedHash)
    },
  )

  it('connects the source tokens to semantic Tailwind utilities', async () => {
    const appCss = await readFile(resolve('src/styles/app.css'), 'utf8')

    expect(appCss).toContain('@theme inline')
    expect(appCss).toContain(
      '--color-brand-primary: var(--aliar-green-700);',
    )
    expect(appCss).toContain('--shadow-brand-card: var(--shadow-card);')
  })

  it('uses only public runtime paths for the design sources', async () => {
    const [indexHtml, appCss, navigationSource] = await Promise.all([
      readFile(resolve('index.html'), 'utf8'),
      readFile(resolve('src/styles/app.css'), 'utf8'),
      readFile(resolve('src/shared/layout/sidebar.tsx'), 'utf8'),
    ])

    expect(indexHtml).toContain('/assets/brand-tokens.css')
    expect(indexHtml).toContain('/assets/favicon.svg')
    expect(navigationSource).toContain('/assets/aliar-logo.svg')

    for (const runtimeSource of [indexHtml, appCss, navigationSource]) {
      expect(runtimeSource).not.toContain('docs/desing')
    }
  })
})
