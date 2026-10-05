import { ViewTransition, version as reactVersion } from 'react'
import { version as reactDomVersion } from 'react-dom'
import { describe, expect, it } from 'vitest'

import packageManifest from '../../package.json'

const expectedReactVersion = '19.3.0'

describe('React compatibility policy', () => {
  it('uses the exact stable React and React DOM release', () => {
    expect(packageManifest.dependencies.react).toBe(expectedReactVersion)
    expect(packageManifest.dependencies['react-dom']).toBe(expectedReactVersion)
    expect(reactVersion).toBe(expectedReactVersion)
    expect(reactDomVersion).toBe(expectedReactVersion)
    expect('overrides' in packageManifest).toBe(false)
    expect(packageManifest.dependencies.react).not.toMatch(/^npm:/)
    expect(packageManifest.dependencies['react-dom']).not.toMatch(/^npm:/)
  })

  it('exports the stable ViewTransition component', () => {
    expect(ViewTransition).toBeDefined()
  })
})
