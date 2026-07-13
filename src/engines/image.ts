import type { MediaItem } from "@/lib/probe"
import type { ImagePlan } from "@/lib/plan"
import { formatBytes } from "@/lib/format"
import { throwIfAborted, type CompressCallbacks } from "./types"

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality))

let webpSupport: boolean | undefined
async function canEncodeWebP(): Promise<boolean> {
  if (webpSupport === undefined) {
    const c = document.createElement("canvas")
    c.width = c.height = 1
    webpSupport = (await encode(c, "image/webp"))?.type === "image/webp"
  }
  return webpSupport
}

const MAY_HAVE_ALPHA = new Set(["image/png", "image/webp", "image/avif", "image/gif"])

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 64) {
    if (data[i] < 255) return true
  }
  return false
}

function draw(bmp: ImageBitmap, scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

/** Binary-search toBlob quality; null when even the floor quality is too big. */
async function searchQuality(
  canvas: HTMLCanvasElement,
  type: string,
  budget: number,
  cb: CompressCallbacks,
): Promise<Blob | null> {
  let lo = 0.3
  let hi = 0.95
  let best: Blob | null = null
  for (let i = 0; i < 7; i++) {
    throwIfAborted(cb.signal)
    const q = (lo + hi) / 2
    const blob = await encode(canvas, type, q)
    if (!blob) throw new Error("the browser refused to encode this image")
    cb.onLog?.(`[canvas] ${type.slice(6)} q=${q.toFixed(2)} → ${formatBytes(blob.size)}`)
    cb.onProgress?.((i + 1) / 7)
    if (blob.size > budget) {
      hi = q
    } else {
      best = blob
      lo = q
      if (blob.size >= budget * 0.9) break
    }
  }
  return best
}

export async function compressImage(item: MediaItem, plan: ImagePlan, cb: CompressCallbacks): Promise<Blob> {
  cb.onStage?.("analyzing")
  const bmp = await createImageBitmap(item.file)
  try {
    let { canvas, ctx } = draw(bmp, 1)
    const alpha = MAY_HAVE_ALPHA.has(item.file.type) && hasAlpha(ctx, canvas.width, canvas.height)
    const webp = await canEncodeWebP()
    const type = webp ? "image/webp" : alpha ? "image/png" : "image/jpeg"
    cb.onLog?.(`[canvas] ${canvas.width}x${canvas.height}, alpha=${alpha}, encoding as ${type.slice(6)}`)
    cb.onStage?.("pass 1")

    // png has no quality knob — shrink dimensions until it fits
    if (type === "image/png") {
      for (let scale = 1; scale >= 0.2; scale *= 0.7) {
        throwIfAborted(cb.signal)
        const blob = await encode(draw(bmp, scale).canvas, type)
        if (!blob) break
        cb.onLog?.(`[canvas] png ${Math.round(scale * 100)}% → ${formatBytes(blob.size)}`)
        if (blob.size <= plan.budgetBytes) return blob
      }
      throw new Error("couldn't shrink this png under the target — try a larger target size")
    }

    for (let round = 0; round < 3; round++) {
      const best = await searchQuality(canvas, type, plan.budgetBytes, cb)
      if (best) {
        cb.onStage?.("finalizing")
        return best
      }
      // even the floor quality was too big — shrink dimensions and try again
      const floor = (await encode(canvas, type, 0.3))!
      const scale = Math.sqrt(plan.budgetBytes / floor.size) * 0.95
      const next = draw(bmp, (canvas.width / bmp.width) * scale)
      canvas = next.canvas
      ctx = next.ctx
      cb.onLog?.(`[canvas] downscaling to ${canvas.width}x${canvas.height}`)
    }
    throw new Error("couldn't fit this image under the target — try a larger target size")
  } finally {
    bmp.close()
  }
}
