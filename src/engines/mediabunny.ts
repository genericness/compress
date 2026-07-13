import type { MediaItem } from "@/lib/probe"
import { retryVideoBps, type VideoPlan } from "@/lib/plan"
import { formatBitrate, formatBytes } from "@/lib/format"
import { throwIfAborted, type CompressCallbacks } from "./types"

const audioCodecFor = (plan: VideoPlan) => (plan.container === "webm" ? "opus" : "aac") as "opus" | "aac"

/** Can WebCodecs decode this input and encode this plan in the current browser? */
export async function canUseMediabunny(item: MediaItem, plan: VideoPlan): Promise<boolean> {
  if (!item.decodable) return false
  try {
    const mb = await import("mediabunny")
    const ok = await mb.canEncodeVideo(plan.codec, {
      width: plan.width ?? item.width,
      height: plan.height ?? item.height,
      bitrate: plan.videoBps,
    })
    if (!ok) return false
    if (plan.audioBps > 0) {
      const codec = audioCodecFor(plan)
      const opts = { numberOfChannels: 2, sampleRate: 48000, bitrate: plan.audioBps }
      if (!(await mb.canEncodeAudio(codec, opts))) {
        if (codec !== "aac") return false
        const { registerAacEncoder } = await import("@mediabunny/aac-encoder")
        registerAacEncoder()
        if (!(await mb.canEncodeAudio(codec, opts))) return false
      }
    }
    return true
  } catch {
    return false
  }
}

export async function compressWithMediabunny(item: MediaItem, plan: VideoPlan, cb: CompressCallbacks): Promise<Blob> {
  const mb = await import("mediabunny")
  const mime = plan.container === "webm" ? "video/webm" : "video/mp4"
  let videoBps = plan.videoBps

  for (let attempt = 1; ; attempt++) {
    throwIfAborted(cb.signal)
    cb.onStage?.("analyzing")
    cb.onLog?.(
      `[mediabunny] encode ${attempt}: ${plan.codec} ${formatBitrate(videoBps)}` +
        (plan.width ? ` scale=${plan.width}x${plan.height}` : "") +
        (plan.fps ? ` fps=${plan.fps}` : "") +
        (plan.audioBps > 0 ? ` audio=${audioCodecFor(plan)} ${formatBitrate(plan.audioBps)}` : " no audio"),
    )

    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(item.file) })
    const output = new mb.Output({
      format:
        plan.container === "webm"
          ? new mb.WebMOutputFormat()
          : new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new mb.BufferTarget(),
    })
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        codec: plan.codec,
        bitrate: videoBps,
        ...(plan.width && plan.height && { width: plan.width, height: plan.height, fit: "fill" as const }),
        ...(plan.fps && { frameRate: plan.fps }),
      },
      audio: plan.audioBps > 0 ? { codec: audioCodecFor(plan), bitrate: plan.audioBps } : { discard: true },
    })

    const onAbort = () => void conversion.cancel()
    cb.signal?.addEventListener("abort", onAbort, { once: true })
    conversion.onProgress = (p) => cb.onProgress?.(p)
    cb.onStage?.(attempt === 1 ? "pass 1" : "pass 2")

    try {
      await conversion.execute()
    } catch (err) {
      throwIfAborted(cb.signal)
      throw err
    } finally {
      cb.signal?.removeEventListener("abort", onAbort)
    }

    cb.onStage?.("finalizing")
    const blob = new Blob([output.target.buffer!], { type: mime })
    cb.onLog?.(`[mediabunny] encode ${attempt} result: ${formatBytes(blob.size)} (cap ${formatBytes(plan.targetBytes)})`)

    if (blob.size <= plan.targetBytes || attempt >= 2) return blob
    videoBps = retryVideoBps({ ...plan, videoBps }, blob.size)
    cb.onLog?.(`[mediabunny] overshot — retrying at ${formatBitrate(videoBps)}`)
  }
}
