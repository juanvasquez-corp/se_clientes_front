import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'

const backendDirectory = fileURLToPath(
  new URL('../../backend-project/', import.meta.url),
)
const outputFile = fileURLToPath(
  new URL('../src/contracts/generated/api.ts', import.meta.url),
)
const schemaScript = [
  'import json',
  'from main import app',
  'print(json.dumps(app.openapi()))',
].join('; ')

const schemaJson = execFileSync('uv', ['run', 'python', '-c', schemaScript], {
  cwd: backendDirectory,
  encoding: 'utf8',
  env: {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    UV_LINK_MODE: 'copy',
  },
})
const schema = JSON.parse(schemaJson)
const definitions = astToString(await openapiTS(schema))

await mkdir(new URL('../src/contracts/generated/', import.meta.url), {
  recursive: true,
})
await writeFile(outputFile, definitions, 'utf8')
