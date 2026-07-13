export type MediaKind = "image" | "gif" | "video"

export interface MediaItem {
  id: string
  file: File
  kind: MediaKind
  width: number
  height: number
  /** seconds; undefined for images and for videos only ffmpeg can read (probed again at encode time) */
  duration?: number
  fps?: number
  hasAudio?: boolean
  /** mediabunny can read this video — eligible for the WebCodecs engine */
  decodable: boolean
}

export const MAX_INPUT_BYTES = 1.5 * 1024 ** 3

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|ts|mts|m2ts|3gp|wmv|flv|ogv)$/i

export function kindOf(file: File): MediaKind | null {
  if (file.type === "image/gif") return "gif"
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/") || VIDEO_EXT.test(file.name)) return "video"
  return null
}

async function probeImage(file: File, kind: MediaKind): Promise<MediaItem> {
  const bmp = await createImageBitmap(file)
  const item: MediaItem = {
    id: crypto.randomUUID(),
    file,
    kind,
    width: bmp.width,
    height: bmp.height,
    decodable: true,
  }
  bmp.close()
  return item
}

async function probeVideo(file: File): Promise<MediaItem> {
  const base = { id: crypto.randomUUID(), file, kind: "video" as const }
  try {
    const { Input, ALL_FORMATS, BlobSource } = await import("mediabunny")
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error("no video track")
    const [duration, stats, audio, decodable] = await Promise.all([
      input.computeDuration(),
      video.computePacketStats(100),
      input.getPrimaryAudioTrack(),
      video.canDecode(),
    ])
    return {
      ...base,
      width: video.displayWidth,
      height: video.displayHeight,
      duration,
      fps: stats.averagePacketRate,
      hasAudio: audio !== null,
      decodable,
    }
  } catch {
    // Container mediabunny can't read (avi/wmv/flv…). ffmpeg may still convert it;
    // duration/dimensions get probed by ffmpeg right before encoding.
    return { ...base, width: 0, height: 0, decodable: false }
  }
}

/** Throws with a human message when the file can't be used at all. */
export async function probe(file: File): Promise<MediaItem> {
  const kind = kindOf(file)
  if (!kind) throw new Error(`${file.name}: not an image or video`)
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`${file.name}: over the 1.5 GB limit — browsers can't hold more in memory`)
  }
  if (kind === "video") return probeVideo(file)
  return probeImage(file, kind).catch(() => {
    throw new Error(`${file.name}: couldn't read this image — is the file corrupt?`)
  })
}
