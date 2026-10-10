import console from 'node:console'
import { opendir, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const JAVASCRIPT_CHUNK_BUDGET_BYTES = 512_000

function toPortableRelativePath(rootDirectory, filePath) {
  return relative(rootDirectory, filePath).split(sep).join('/')
}

export async function collectJavaScriptFiles(rootDirectory) {
  const absoluteRoot = resolve(rootDirectory)
  const files = []

  async function visit(directoryPath) {
    const directory = await opendir(directoryPath)
    for await (const entry of directory) {
      const entryPath = resolve(directoryPath, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath)
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const metadata = await stat(entryPath)
        files.push({
          path: toPortableRelativePath(absoluteRoot, entryPath),
          bytes: metadata.size,
        })
      }
    }
  }

  await visit(absoluteRoot)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

export function evaluateBundleBudget(
  files,
  maximumBytes = JAVASCRIPT_CHUNK_BUDGET_BYTES,
) {
  const offendingFiles = files.filter(({ bytes }) => bytes > maximumBytes)
  return {
    passed: files.length > 0 && offendingFiles.length === 0,
    offendingFiles,
  }
}

export async function checkBuildBudget(rootDirectory = 'dist') {
  const files = await collectJavaScriptFiles(rootDirectory)
  const result = evaluateBundleBudget(files)

  if (files.length === 0) {
    console.error(`Presupuesto JavaScript: no se encontraron archivos .js en ${rootDirectory}.`)
    return false
  }

  console.log(
    `Presupuesto JavaScript (máximo ${JAVASCRIPT_CHUNK_BUDGET_BYTES} bytes por archivo):`,
  )
  for (const file of files) console.log(`- ${file.path}: ${file.bytes} bytes`)

  if (!result.passed) {
    console.error('Presupuesto JavaScript excedido:')
    for (const file of result.offendingFiles) {
      console.error(
        `- ${file.path}: ${file.bytes} bytes (excede por ${file.bytes - JAVASCRIPT_CHUNK_BUDGET_BYTES})`,
      )
    }
  }

  return result.passed
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectExecution) {
  try {
    const passed = await checkBuildBudget(process.argv[2] ?? 'dist')
    if (!passed) process.exitCode = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error desconocido'
    console.error(`No se pudo verificar el presupuesto JavaScript: ${message}`)
    process.exitCode = 1
  }
}
