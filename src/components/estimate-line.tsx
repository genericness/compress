import { ArrowRightIcon } from "lucide-react"
import type { MediaItem } from "@/lib/probe"
import { planFor, type Settings } from "@/lib/plan"
import { formatBitrate } from "@/lib/format"
import { cn } from "@/lib/utils"

function describe(item: MediaItem, settings: Settings): { text: string; bad?: boolean } {
  const plan = planFor(item, settings)
  switch (plan.kind) {
    case "passthrough":
      return { text: "already under the target — passed through untouched" }
    case "image":
      return { text: `quality search down to the target · ${item.width}×${item.height} · jpeg/webp` }
    case "deferred":
      return {
        text: plan.fromGif
          ? "gif → mp4 · analyzed at compress time (loses auto-loop embed)"
          : "analyzed at compress time — this format needs the ffmpeg engine",
      }
    case "impossible":
      return { text: plan.reason, bad: true }
    case "video": {
      const w = plan.width ?? item.width
      const h = plan.height ?? item.height
      const fps = plan.fps ?? Math.round(item.fps ?? 30)
      const audio = plan.audioBps > 0 ? ` + ${formatBitrate(plan.audioBps)} audio` : ""
      const codec = plan.codec === "vp9" ? "VP9 WebM" : "H.264 MP4"
      const gif = plan.fromGif ? " · gif → mp4" : ""
      return { text: `${w}×${h} · ${fps}fps · ~${formatBitrate(plan.videoBps)}${audio} · ${codec}${gif}` }
    }
  }
}

export function EstimateLine({ items, settings }: { items: MediaItem[]; settings: Settings }) {
  if (items.length === 0) return null
  const videos = items.filter((i) => i.kind !== "image")
  const rep = videos.length
    ? videos.reduce((a, b) => (b.file.size > a.file.size ? b : a))
    : items.reduce((a, b) => (b.file.size > a.file.size ? b : a))
  const { text, bad } = describe(rep, settings)
  const impossibleCount = items.filter((i) => planFor(i, settings).kind === "impossible").length

  return (
    <div className={cn("flex items-start gap-1.5 font-mono text-xs", bad ? "text-destructive" : "text-muted-foreground")}>
      <ArrowRightIcon className="mt-px size-3.5 shrink-0" />
      <span>
        {items.length > 1 && !bad ? `${rep.file.name}: ` : ""}
        {text}
        {items.length > 1 && impossibleCount > 0 && !bad && (
          <span className="text-destructive"> · {impossibleCount} file(s) can't hit this target</span>
        )}
      </span>
    </div>
  )
}
