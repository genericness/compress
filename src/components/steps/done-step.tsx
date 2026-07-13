import { useEffect, useMemo, useState } from "react"
import { AlertTriangleIcon, DownloadIcon, RotateCcwIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Job } from "@/hooks/use-compressor"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

function saved(job: Job): string {
  const pct = Math.round((1 - job.result!.blob.size / job.item.file.size) * 100)
  return pct <= 0 ? "±0%" : `-${pct}%`
}

function download(job: Job) {
  const url = URL.createObjectURL(job.result!.blob)
  const a = document.createElement("a")
  a.href = url
  a.download = job.result!.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function Preview({ job }: { job: Job }) {
  const [side, setSide] = useState<"before" | "after">("after")
  const blob = side === "after" ? job.result!.blob : job.item.file
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const isVideo = blob.type.startsWith("video/")

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-popover/40">
      {isVideo ? (
        <video src={url} controls playsInline className="max-h-72 w-full bg-black" />
      ) : (
        <img src={url} alt={job.result!.name} className="max-h-72 w-full object-contain" />
      )}
      {job.result!.blob !== job.item.file && (
        <div className="flex items-center justify-center gap-1 border-t border-border/70 p-1.5">
          {(["before", "after"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={cn(
                "rounded-md px-2.5 py-0.5 text-xs transition-colors",
                side === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "before" ? `original · ${formatBytes(job.item.file.size)}` : `compressed · ${formatBytes(job.result!.blob.size)}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ResultRow({ job }: { job: Job }) {
  if (job.status !== "done") {
    return (
      <li className="flex items-center gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
        <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1 truncate text-sm" title={job.item.file.name}>
          {job.item.file.name}
        </span>
        <span className="shrink-0 text-xs text-destructive">{job.error ?? job.status}</span>
      </li>
    )
  }
  return (
    <li className="flex items-center gap-2.5 rounded-md border border-border/70 bg-card/40 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm" title={job.result!.name}>
        {job.result!.name}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {formatBytes(job.item.file.size)} → {formatBytes(job.result!.blob.size)}
      </span>
      <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
        {saved(job)}
      </Badge>
      <Button variant="ghost" size="icon-xs" aria-label={`download ${job.result!.name}`} onClick={() => download(job)}>
        <DownloadIcon />
      </Button>
    </li>
  )
}

export function DoneStep({ jobs, onReset }: { jobs: Job[]; onReset: () => void }) {
  const done = jobs.filter((j) => j.status === "done")
  const single = jobs.length === 1 ? jobs[0] : null

  async function downloadAll() {
    for (const job of done) {
      download(job)
      await new Promise((r) => setTimeout(r, 350))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {single?.status === "done" ? (
        <>
          <div className="flex items-baseline justify-center gap-2.5 font-mono">
            <span className="text-sm text-muted-foreground line-through">{formatBytes(single.item.file.size)}</span>
            <span className="text-xl text-foreground">{formatBytes(single.result!.blob.size)}</span>
            <Badge variant="secondary" className="font-mono">{saved(single)}</Badge>
          </div>
          {single.overTarget && (
            <p className="text-center text-xs text-destructive">
              still a hair over the target — precise mode or a lower target will land under it
            </p>
          )}
          <Preview job={single} />
          <Button size="lg" className="w-full" onClick={() => download(single)}>
            <DownloadIcon data-icon="inline-start" />
            download {formatBytes(single.result!.blob.size)}
          </Button>
        </>
      ) : single ? (
        <ResultRow job={single} />
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {jobs.map((job) => (
              <ResultRow key={job.item.id} job={job} />
            ))}
          </ul>
          {done.length > 1 && (
            <Button size="lg" className="w-full" onClick={downloadAll}>
              <DownloadIcon data-icon="inline-start" />
              download all ({done.length})
            </Button>
          )}
        </>
      )}
      <Button variant="ghost" size="sm" className="self-center" onClick={onReset}>
        <RotateCcwIcon data-icon="inline-start" />
        compress another
      </Button>
    </div>
  )
}
