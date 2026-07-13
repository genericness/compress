export type Stage = "analyzing" | "pass 1" | "pass 2" | "finalizing"

export interface CompressCallbacks {
  onProgress?: (fraction: number) => void
  onStage?: (stage: Stage) => void
  onLog?: (line: string) => void
  signal?: AbortSignal
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("compression cancelled", "AbortError")
}
