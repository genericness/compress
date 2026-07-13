import type { MediaItem } from "./probe"

export type Speed = "fast" | "precise"

export interface Settings {
  targetBytes: number
  speed: Speed
  // Advanced — undefined means automatic
  maxHeight?: number
  fps?: number
  stripAudio?: boolean
  audioBps?: number
  codec?: "avc" | "vp9"
}

export interface VideoPlan {
  kind: "video"
  codec: "avc" | "vp9"
  container: "mp4" | "webm"
  videoBps: number
  /** 0 = no audio track in the output */
  audioBps: number
  /** set only when downscaling; always even */
  width?: number
  height?: number
  /** set only when reducing */
  fps?: number
  /** what we aim for (target × margin) */
  budgetBytes: number
  /** the hard cap the user picked */
  targetBytes: number
  twoPass: boolean
  /** the input is a GIF being converted to video */
  fromGif?: boolean
}

export interface ImagePlan {
  kind: "image"
  budgetBytes: number
}

/** Already under target — hand the original back. */
export interface PassThroughPlan {
  kind: "passthrough"
}

/** Duration/dimensions unknown until ffmpeg reads the file at compress time. */
export interface DeferredPlan {
  kind: "deferred"
  fromGif?: boolean
}

export interface ImpossiblePlan {
  kind: "impossible"
  reason: string
}

export type Plan = VideoPlan | ImagePlan | PassThroughPlan | DeferredPlan | ImpossiblePlan

// --- Tunables (see docs/agents/compression.md) ---------------------------
/** Fraction of the target we actually aim for, so uploads never bounce. */
const MARGIN: Record<Speed, number> = { fast: 0.95, precise: 0.97 }
/** Bits per pixel below which H.264 turns to mush. */
const MIN_BPP = 0.045
/** Below this even 240p24 looks broken — give up and tell the user. */
const FLOOR_BPP = 0.02
/** Output "p" classes we downscale through (applied to the short side). */
const LADDER = [1440, 1080, 720, 540, 480, 360, 240]
const AUDIO_STEPS = [128_000, 96_000, 64_000]

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2))

function pickAudioBps(totalBps: number): number {
  const raw = totalBps * 0.1
  return AUDIO_STEPS.find((s) => raw >= s) ?? AUDIO_STEPS[AUDIO_STEPS.length - 1]
}

export function planVideo(item: MediaItem, settings: Settings, duration = item.duration): Plan {
  if (duration === undefined || item.width === 0) return { kind: "deferred", fromGif: item.kind === "gif" }

  const speed = settings.speed
  const budgetBytes = Math.floor(settings.targetBytes * MARGIN[speed])
  const totalBps = (budgetBytes * 8) / duration

  const wantsAudio = item.hasAudio === true && !settings.stripAudio
  let audioBps = wantsAudio ? (settings.audioBps ?? pickAudioBps(totalBps)) : 0
  let videoBps = totalBps - audioBps
  if (videoBps < 100_000 && audioBps > 64_000) {
    audioBps = 64_000
    videoBps = totalBps - audioBps
  }

  let fps = item.fps && item.fps > 0 ? item.fps : 30
  if (settings.fps) fps = Math.min(fps, settings.fps)

  // Downscale by the short side so portrait and landscape get the same "p" class
  const srcShort = Math.min(item.width, item.height)
  let short = srcShort
  if (settings.maxHeight) short = Math.min(short, settings.maxHeight)

  const bpp = (s: number, f: number) => videoBps / (item.width * (s / srcShort) * item.height * (s / srcShort) * f)

  if (bpp(short, fps) < MIN_BPP && fps > 30) fps = 30
  if (bpp(short, fps) < MIN_BPP) {
    const fit = LADDER.filter((s) => s < short).find((s) => bpp(s, fps) >= MIN_BPP)
    short = fit ?? Math.min(short, LADDER[LADDER.length - 1])
  }
  if (bpp(short, fps) < MIN_BPP && fps > 24) fps = 24
  if (videoBps <= 0 || bpp(short, fps) < FLOOR_BPP) {
    return {
      kind: "impossible",
      reason: "even at 240p / 24fps this won't fit the target — raise the target, trim the video, or strip audio",
    }
  }

  const scale = short / srcShort
  const codec = settings.codec ?? "avc"
  return {
    kind: "video",
    codec,
    container: codec === "vp9" ? "webm" : "mp4",
    videoBps: Math.round(videoBps),
    audioBps,
    ...(scale < 1 && { width: even(item.width * scale), height: even(item.height * scale) }),
    ...(fps < (item.fps ?? 30) - 0.5 && { fps: Math.round(fps) }),
    budgetBytes,
    targetBytes: settings.targetBytes,
    twoPass: speed === "precise",
    ...(item.kind === "gif" && { fromGif: true }),
  }
}

export function planFor(item: MediaItem, settings: Settings): Plan {
  if (item.file.size <= settings.targetBytes) return { kind: "passthrough" }
  if (item.kind === "image") {
    return { kind: "image", budgetBytes: Math.floor(settings.targetBytes * MARGIN[settings.speed]) }
  }
  return planVideo(item, settings)
}

/** Bitrate for the single retry after an overshoot. */
export function retryVideoBps(plan: VideoPlan, actualBytes: number): number {
  return Math.round(plan.videoBps * (plan.budgetBytes / actualBytes) * 0.95)
}
