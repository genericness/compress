import { useRef, useState } from "react"
import { UploadIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function Dropzone({ onFiles, busy }: { onFiles: (files: File[]) => void; busy?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files])
      }}
      className={cn(
        "flex min-h-56 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
        "hover:border-primary/60 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-ring",
        over && "border-primary bg-accent/40",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,.mkv,.avi,.wmv,.flv,.ts,.m2ts"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files])
          e.target.value = ""
        }}
      />
      <UploadIcon className={cn("size-8 text-muted-foreground transition-colors", over && "text-primary")} />
      <div>
        <p className="text-sm font-medium text-foreground">
          {busy ? "reading files…" : "drop files here, click to browse, or paste"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">images and videos · several at once is fine · up to 1.5 GB</p>
      </div>
    </button>
  )
}
