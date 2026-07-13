import { useRef, useState } from "react"
import type { MediaItem } from "@/lib/probe"
import { planFor, type Settings } from "@/lib/plan"
import type { CompressCallbacks, Stage } from "@/engines/types"
import { MB } from "@/lib/format"

export type Engine = "mediabunny" | "ffmpeg" | "canvas" | "none"
export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled"

export interface Job {
  item: MediaItem
  status: JobStatus
  progress: number
  stage: Stage | null
  engine?: Engine
  result?: { blob: Blob; name: string }
  error?: string
  overTarget?: boolean
}

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
}

function outputName(item: MediaItem, blob: Blob, settings: Settings, passthrough: boolean): string {
  if (passthrough) return item.file.name
  const base = item.file.name.replace(/\.[^.]+$/, "")
  const ext = EXT[blob.type] ?? "bin"
  return `${base}-${Math.round(settings.targetBytes / MB)}mb.${ext}`
}

export function useCompressor() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const patch = (id: string, p: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.item.id === id ? { ...j, ...p } : j)))
  const log = (line: string) => setLogs((prev) => [...prev.slice(-499), line])

  async function runOne(item: MediaItem, settings: Settings, signal: AbortSignal): Promise<void> {
    const plan = planFor(item, settings)
    const cb: CompressCallbacks = {
      signal,
      onLog: log,
      onProgress: (f) => patch(item.id, { progress: f }),
      onStage: (s) => patch(item.id, { stage: s }),
    }
    patch(item.id, { status: "running" })
    try {
      let blob: Blob
      let engine: Engine
      switch (plan.kind) {
        case "impossible":
          throw new Error(plan.reason)
        case "passthrough":
          blob = item.file
          engine = "none"
          log(`${item.file.name}: already under the target — passed through`)
          break
        case "image": {
          const { compressImage } = await import("@/engines/image")
          engine = "canvas"
          blob = await compressImage(item, plan, cb)
          break
        }
        case "video": {
          const { canUseMediabunny, compressWithMediabunny } = await import("@/engines/mediabunny")
          if (await canUseMediabunny(item, plan)) {
            engine = "mediabunny"
            blob = await compressWithMediabunny(item, plan, cb)
          } else {
            log(`${item.file.name}: WebCodecs can't handle this here — falling back to ffmpeg`)
            const { compressWithFfmpeg } = await import("@/engines/ffmpeg")
            engine = "ffmpeg"
            blob = await compressWithFfmpeg(item, plan, settings, cb)
          }
          break
        }
        case "deferred": {
          const { compressWithFfmpeg } = await import("@/engines/ffmpeg")
          engine = "ffmpeg"
          blob = await compressWithFfmpeg(item, plan, settings, cb)
          break
        }
      }
      patch(item.id, {
        status: "done",
        progress: 1,
        stage: null,
        engine,
        result: { blob, name: outputName(item, blob, settings, plan.kind === "passthrough") },
        overTarget: blob.size > settings.targetBytes,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        patch(item.id, { status: "cancelled", stage: null })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        log(`${item.file.name}: failed — ${message}`)
        patch(item.id, { status: "error", error: message, stage: null })
      }
    }
  }

  /** Runs the batch sequentially. Resolves true if it ran to the end, false if cancelled. */
  async function run(items: MediaItem[], settings: Settings): Promise<boolean> {
    const ac = new AbortController()
    abortRef.current = ac
    setLogs([])
    setJobs(items.map((item) => ({ item, status: "queued", progress: 0, stage: null })))
    for (const item of items) {
      if (ac.signal.aborted) {
        patch(item.id, { status: "cancelled" })
        continue
      }
      await runOne(item, settings, ac.signal)
    }
    return !ac.signal.aborted
  }

  const cancel = () => abortRef.current?.abort()

  return { jobs, logs, run, cancel }
}
