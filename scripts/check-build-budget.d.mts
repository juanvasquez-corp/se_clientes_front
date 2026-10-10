export const JAVASCRIPT_CHUNK_BUDGET_BYTES: 512000

export interface JavaScriptChunk {
  readonly path: string
  readonly bytes: number
}

export interface BundleBudgetResult {
  readonly passed: boolean
  readonly offendingFiles: JavaScriptChunk[]
}

export function collectJavaScriptFiles(
  rootDirectory: string,
): Promise<JavaScriptChunk[]>

export function evaluateBundleBudget(
  files: readonly JavaScriptChunk[],
  maximumBytes?: number,
): BundleBudgetResult

export function checkBuildBudget(rootDirectory?: string): Promise<boolean>
