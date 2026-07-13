import type { FFmpeg } from "@ffmpeg/ffmpeg"
import type { MediaItem } from "@/lib/probe"
import { planVideo, retryVideoBps, type DeferredPlan, type Settings, type VideoPlan } from "@/lib/plan"
import { formatBitrate, formatBytes } from "@/lib/format"
import { throwIfAborted, type CompressCallbacks } from "./types"

let instance: Promise<FFmpeg> | null = null
let usingMT = false
// jobs run sequentially, so one mutable sink is enough to route log events
let logSink: ((line: string) => void) | null = null

async function inflate(url: string, type: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to fetch ${url} (${res.status})`)
  // some servers (vite dev) send .gz with Content-Encoding and hand us inflated
  // bytes; others (cloudflare assets) hand us the raw gzip — check the magic
  let bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
    bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
}

async function load(): Promise<FFmpeg> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg")
  const ffmpeg = new FFmpeg()
  ffmpeg.on("log", ({ message }) => logSink?.(message))
  // ?ffmpeg=st|mt forces a core — handy when debugging engine behavior
  const forced = new URLSearchParams(location.search).get("ffmpeg")
  const mt = forced ? forced === "mt" : typeof SharedArrayBuffer !== "undefined" && crossOriginIsolated
  usingMT = mt
  const dir = `${location.origin}/ffmpeg/${__FFMPEG_CORE_VERSION__}/${mt ? "mt" : "st"}`
  await ffmpeg.load({
    coreURL: `${dir}/ffmpeg-core.js`,
    wasmURL: await inflate(`${dir}/ffmpeg-core.wasm.gz`, "application/wasm"),
    ...(mt && { workerURL: `${dir}/ffmpeg-core.worker.js` }),
  })
  return ffmpeg
}

function getFFmpeg(): Promise<FFmpeg> {
  instance ??= load().catch((err) => {
    instance = null
    throw err
  })
  return instance
}

const parseClock = (s: string): number => {
  const m = s.match(/(\d+):(\d\d):(\d\d(?:\.\d+)?)/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
}

interface ProbedMeta {
  duration: number
  width: number
  height: number
  fps?: number
  hasAudio: boolean
}

/** ffmpeg -i dumps stream info to stderr; exec "fails" but the log has everything. */
async function probeWithFfmpeg(ffmpeg: FFmpeg, name: string): Promise<ProbedMeta> {
  const lines: string[] = []
  const prev = logSink
  logSink = (l) => {
    lines.push(l)
    prev?.(l)
  }
  await ffmpeg.exec(["-hide_banner", "-i", name]).catch(() => {})
  logSink = prev
  const all = lines.join("\n")
  const durMatch = all.match(/Duration:\s*(\d+:\d\d:\d\d(?:\.\d+)?)/)
  const videoLine = lines.find((l) => /Stream #.*Video/.test(l)) ?? ""
  const dims = videoLine.match(/(\d{2,5})x(\d{2,5})/)
  const fps = videoLine.match(/([\d.]+) fps/)
  if (!durMatch || !dims) throw new Error("ffmpeg couldn't read this file — the codec or container isn't supported")
  return {
    duration: parseClock(durMatch[1]),
    width: Number(dims[1]),
    height: Number(dims[2]),
    fps: fps ? Number(fps[1]) : undefined,
    hasAudio: /Stream #.*Audio/.test(all),
  }
}

function buildArgs(input: string, output: string, plan: VideoPlan, videoBps: number, pass?: 1 | 2): string[] {
  const filters = [
    ...(plan.width && plan.height ? [`scale=${plan.width}:${plan.height}`] : []),
    ...(plan.fps ? [`fps=${plan.fps}`] : []),
  ]
  return [
    "-hide_banner",
    "-y",
    "-i",
    input,
    // x264 auto-threads deadlocks against the fixed wasm pthread pool — cap it
    ...(usingMT ? ["-threads", "4"] : []),
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-b:v",
    String(videoBps),
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    ...(pass ? ["-pass", String(pass), "-passlogfile", "pl"] : ["-maxrate", String(videoBps), "-bufsize", String(videoBps * 2)]),
    ...(pass === 1 || plan.audioBps === 0 ? ["-an"] : ["-c:a", "aac", "-b:a", String(plan.audioBps)]),
    ...(pass === 1 ? ["-f", "null", "-"] : ["-movflags", "+faststart", output]),
  ]
}

export async function compressWithFfmpeg(
  item: MediaItem,
  plan: VideoPlan | DeferredPlan,
  settings: Settings,
  cb: CompressCallbacks,
): Promise<Blob> {
  cb.onStage?.("analyzing")
  cb.onLog?.("[ffmpeg] loading engine…")
  const ffmpeg = await getFFmpeg()
  throwIfAborted(cb.signal)

  const onAbort = () => {
    ffmpeg.terminate()
    instance = null
  }
  cb.signal?.addEventListener("abort", onAbort, { once: true })

  const input = `in-${item.id.slice(0, 8)}`
  const output = `out-${item.id.slice(0, 8)}.mp4`
  let duration = item.duration ?? 0

  try {
    const { fetchFile } = await import("@ffmpeg/util")
    await ffmpeg.writeFile(input, await fetchFile(item.file))
    throwIfAborted(cb.signal)

    // Resolve a deferred plan (gif or ffmpeg-only container) from ffmpeg's own probe
    let resolved: VideoPlan
    if (plan.kind === "deferred") {
      const meta = await probeWithFfmpeg(ffmpeg, input)
      duration = meta.duration
      const p = planVideo({ ...item, ...meta, decodable: false }, settings, meta.duration)
      if (p.kind === "impossible") throw new Error(p.reason)
      if (p.kind !== "video") throw new Error("unexpected plan for this file")
      cb.onLog?.(`[ffmpeg] probed: ${meta.width}x${meta.height} ${meta.duration.toFixed(1)}s`)
      resolved = p
    } else {
      resolved = plan
    }

    let videoBps = resolved.videoBps
    for (let attempt = 1; ; attempt++) {
      throwIfAborted(cb.signal)
      cb.onLog?.(`[ffmpeg] encode ${attempt}: libx264 ${formatBitrate(videoBps)}${resolved.twoPass ? " (two-pass)" : ""}`)

      const passes: Array<1 | 2 | undefined> = resolved.twoPass ? [1, 2] : [undefined]
      for (const pass of passes) {
        cb.onStage?.(pass === 2 ? "pass 2" : "pass 1")
        logSink = (line) => {
          cb.onLog?.(line)
          const t = line.match(/time=\s*(\d+:\d\d:\d\d(?:\.\d+)?)/)
          if (t && duration > 0) {
            const f = Math.min(1, parseClock(t[1]) / duration)
            cb.onProgress?.(resolved.twoPass ? (pass === 1 ? f / 2 : 0.5 + f / 2) : f)
          }
        }
        const code = await ffmpeg.exec(buildArgs(input, output, resolved, videoBps, pass))
        logSink = null
        throwIfAborted(cb.signal)
        if (code !== 0) throw new Error("ffmpeg failed to encode this file — try a different source format")
      }

      cb.onStage?.("finalizing")
      const data = (await ffmpeg.readFile(output)) as Uint8Array<ArrayBuffer>
      const blob = new Blob([data], { type: "video/mp4" })
      cb.onLog?.(`[ffmpeg] encode ${attempt} result: ${formatBytes(blob.size)} (cap ${formatBytes(resolved.targetBytes)})`)
      if (blob.size <= resolved.targetBytes || attempt >= 2) return blob
      videoBps = retryVideoBps({ ...resolved, videoBps }, blob.size)
      cb.onLog?.(`[ffmpeg] overshot — retrying at ${formatBitrate(videoBps)}`)
    }
  } finally {
    cb.signal?.removeEventListener("abort", onAbort)
    logSink = null
    // reclaim MEMFS between jobs; ignore errors if we were terminated
    await ffmpeg.deleteFile(input).catch(() => {})
    await ffmpeg.deleteFile(output).catch(() => {})
  }
}
