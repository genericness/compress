import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { LogTerminal } from "@/components/log-terminal"
import type { Job } from "@/hooks/use-compressor"

const FINISHED = new Set(["done", "error", "cancelled"])

export function WorkingStep({ jobs, logs, onCancel }: { jobs: Job[]; logs: string[]; onCancel: () => void }) {
  const current = jobs.find((j) => j.status === "running")
  const finished = jobs.filter((j) => FINISHED.has(j.status)).length
  const overall = jobs.length ? (finished + (current?.progress ?? 0)) / jobs.length : 0
  const label = current?.item.file.name ?? jobs[jobs.length - 1]?.item.file.name ?? ""

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium" title={label}>
          compressing {label}
        </span>
        {jobs.length > 1 && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            file {Math.min(finished + 1, jobs.length)} of {jobs.length}
          </span>
        )}
      </div>

      <Progress value={overall * 100} />

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          {current?.stage ?? "working"} · {Math.round(overall * 100)}%
        </span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          cancel
        </Button>
      </div>

      <LogTerminal logs={logs} />
    </div>
  )
}
