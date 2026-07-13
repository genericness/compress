import { FileVideoIcon, ImageIcon, XIcon } from "lucide-react"
import type { MediaItem } from "@/lib/probe"
import { formatBytes, formatDuration } from "@/lib/format"
import { Button } from "@/components/ui/button"

function detail(item: MediaItem): string {
  const parts: string[] = [formatBytes(item.file.size)]
  if (item.width > 0) parts.push(`${item.width}×${item.height}`)
  if (item.duration !== undefined) parts.push(formatDuration(item.duration))
  return parts.join(" · ")
}

export function FileSummary({ items, onRemove }: { items: MediaItem[]; onRemove?: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2.5 rounded-md border border-border/70 bg-card/40 px-3 py-2">
          {item.kind === "video" ? (
            <FileVideoIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={item.file.name}>
            {item.file.name}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{detail(item)}</span>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`remove ${item.file.name}`}
              onClick={() => onRemove(item.id)}
            >
              <XIcon />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
