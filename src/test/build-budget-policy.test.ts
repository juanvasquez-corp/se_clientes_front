import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  JAVASCRIPT_CHUNK_BUDGET_BYTES,
  collectJavaScriptFiles,
  evaluateBundleBudget,
} from '../../scripts/check-build-budget.mjs'

const temporaryDirectories: string[] = []

async function createBuildDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'frontend-build-budget-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('JavaScript build budget', () => {
  it('accepts a chunk whose byte size equals the inclusive limit', () => {
    const result = evaluateBundleBudget([
      { path: 'assets/entry.js', bytes: JAVASCRIPT_CHUNK_BUDGET_BYTES },
    ])

    expect(result).toEqual({ passed: true, offendingFiles: [] })
  })

  it('rejects a chunk one byte above the limit', () => {
    const result = evaluateBundleBudget([
      { path: 'assets/entry.js', bytes: JAVASCRIPT_CHUNK_BUDGET_BYTES + 1 },
    ])

    expect(result).toEqual({
      passed: false,
      offendingFiles: [
        { path: 'assets/entry.js', bytes: JAVASCRIPT_CHUNK_BUDGET_BYTES + 1 },
      ],
    })
  })

  it('collects every nested JavaScript chunk in stable relative-path order', async () => {
    const buildDirectory = await createBuildDirectory()
    await mkdir(join(buildDirectory, 'assets', 'nested'), { recursive: true })
    await writeFile(join(buildDirectory, 'entry.js'), Buffer.alloc(2))
    await writeFile(join(buildDirectory, 'assets', 'vendor.js'), Buffer.alloc(3))
    await writeFile(join(buildDirectory, 'assets', 'nested', 'page.js'), Buffer.alloc(4))

    await expect(collectJavaScriptFiles(buildDirectory)).resolves.toEqual([
      { path: 'assets/nested/page.js', bytes: 4 },
      { path: 'assets/vendor.js', bytes: 3 },
      { path: 'entry.js', bytes: 2 },
    ])
  })

  it('rejects a build that contains no JavaScript', async () => {
    const buildDirectory = await createBuildDirectory()
    await writeFile(join(buildDirectory, 'index.html'), '<main></main>')

    const files = await collectJavaScriptFiles(buildDirectory)

    expect(files).toEqual([])
    expect(evaluateBundleBudget(files)).toEqual({
      passed: false,
      offendingFiles: [],
    })
  })

  it('excludes source maps, CSS, assets, and compressed artifacts', async () => {
    const buildDirectory = await createBuildDirectory()
    await mkdir(join(buildDirectory, 'assets'), { recursive: true })
    await writeFile(join(buildDirectory, 'assets', 'entry.js.map'), Buffer.alloc(7))
    await writeFile(join(buildDirectory, 'assets', 'style.css'), Buffer.alloc(8))
    await writeFile(join(buildDirectory, 'assets', 'entry.js.gz'), Buffer.alloc(9))
    await writeFile(join(buildDirectory, 'assets', 'entry.js.br'), Buffer.alloc(10))
    await writeFile(join(buildDirectory, 'assets', 'icon.svg'), Buffer.alloc(11))

    await expect(collectJavaScriptFiles(buildDirectory)).resolves.toEqual([])
  })
})
