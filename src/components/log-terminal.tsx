import { useEffect, useRef, useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function LogTerminal({ logs }: { logs: string[] }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [logs, open])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? "hide log" : "show log"}
      </button>
      {open && (
        <div
          ref={boxRef}
          className="mt-2 h-40 overflow-y-auto rounded-md border border-border/70 bg-popover/60 p-2.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground"
        >
          {logs.length ? logs.join("\n") : "…"}
        </div>
      )}
    </div>
  )
}
