import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ElasticSlider, type SliderPreset } from "@/components/elastic-slider"
import { EstimateLine } from "@/components/estimate-line"
import { AdvancedPanel } from "@/components/advanced-panel"
import { FileSummary } from "@/components/file-summary"
import { planFor, type Settings, type Speed } from "@/lib/plan"
import type { MediaItem } from "@/lib/probe"
import { MB } from "@/lib/format"

const PRESETS: SliderPreset[] = [
  { mb: 10, label: "free" },
  { mb: 50, label: "basic · boost 2" },
  { mb: 100, label: "boost 3" },
  { mb: 500, label: "nitro" },
]

const TIER: Record<number, string> = {
  10: "free",
  50: "nitro basic / boost lvl 2",
  100: "boost lvl 3",
  500: "nitro",
}

export function TargetStep({
  items,
  settings,
  onPatch,
  onRemove,
  onStart,
  onReset,
}: {
  items: MediaItem[]
  settings: Settings
  onPatch: (patch: Partial<Settings>) => void
  onRemove: (id: string) => void
  onStart: () => void
  onReset: () => void
}) {
  const mb = settings.targetBytes / MB
  const [customText, setCustomText] = useState("")

  function setMB(value: number) {
    onPatch({ targetBytes: Math.round(value * MB) })
    setCustomText("")
  }

  const runnable = items.filter((i) => planFor(i, settings).kind !== "impossible").length

  return (
    <div className="flex flex-col gap-5">
      <FileSummary items={items} onRemove={onRemove} />

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">target size</span>
          <span className="font-mono text-sm text-foreground">
            {Math.round(mb)} MB
            <span className="ml-1.5 text-xs text-muted-foreground">{TIER[mb] ?? "custom"}</span>
          </span>
        </div>
        <ElasticSlider className="mt-3" value={mb} onChange={setMB} presets={PRESETS} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="custom-mb" className="text-xs text-muted-foreground">
            custom
          </label>
          <Input
            id="custom-mb"
            type="number"
            min={1}
            max={1000}
            placeholder={String(Math.round(mb))}
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value)
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v >= 1 && v <= 1000) onPatch({ targetBytes: Math.round(v * MB) })
            }}
            className="h-7 w-20 font-mono text-xs"
          />
          <span className="text-xs text-muted-foreground">MB</span>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <div>
                <ToggleGroup
                  value={[settings.speed]}
                  onValueChange={(v: string[]) => {
                    if (v.length) onPatch({ speed: v[0] as Speed })
                  }}
                  variant="outline"
                >
                  <ToggleGroupItem
                    value="fast"
                    className="px-3 text-xs aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                  >
                    fast
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="precise"
                    className="px-3 text-xs aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                  >
                    precise
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            }
          />
          <TooltipContent side="top">
            fast: one encode pass · precise: slower, lands closer to the target
          </TooltipContent>
        </Tooltip>
      </div>

      <EstimateLine items={items} settings={settings} />

      <AdvancedPanel settings={settings} onPatch={onPatch} />

      <div className="flex items-center justify-between border-t border-border/70 pt-4">
        <Button variant="ghost" size="sm" onClick={onReset}>
          start over
        </Button>
        <Button size="lg" disabled={runnable === 0} onClick={onStart}>
          compress {items.length > 1 ? `${runnable} file${runnable === 1 ? "" : "s"}` : ""}
        </Button>
      </div>
    </div>
  )
}
