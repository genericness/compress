import { useEffect, useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { Settings } from "@/lib/plan"

type Patch = (patch: Partial<Settings>) => void

function OptionSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => onChange(v as string)}>
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AdvancedPanel({ settings, onPatch }: { settings: Settings; onPatch: Patch }) {
  const [vp9, setVp9] = useState(false)
  useEffect(() => {
    import("mediabunny")
      .then((m) => Promise.resolve(m.canEncode("vp9")))
      .then((ok) => setVp9(Boolean(ok)))
      .catch(() => {})
  }, [])

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-180" />
        advanced
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv-res" className="text-xs text-muted-foreground">
              resolution cap
            </Label>
            <OptionSelect
              id="adv-res"
              value={settings.maxHeight ? String(settings.maxHeight) : "auto"}
              onChange={(v) => onPatch({ maxHeight: v === "auto" ? undefined : Number(v) })}
              options={[
                { value: "auto", label: "auto" },
                { value: "1080", label: "1080p" },
                { value: "720", label: "720p" },
                { value: "480", label: "480p" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv-fps" className="text-xs text-muted-foreground">
              frame rate
            </Label>
            <OptionSelect
              id="adv-fps"
              value={settings.fps ? String(settings.fps) : "auto"}
              onChange={(v) => onPatch({ fps: v === "auto" ? undefined : Number(v) })}
              options={[
                { value: "auto", label: "auto" },
                { value: "60", label: "60" },
                { value: "30", label: "30" },
                { value: "24", label: "24" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv-audio" className="text-xs text-muted-foreground">
              audio bitrate
            </Label>
            <OptionSelect
              id="adv-audio"
              value={settings.audioBps ? String(settings.audioBps / 1000) : "auto"}
              onChange={(v) => onPatch({ audioBps: v === "auto" ? undefined : Number(v) * 1000 })}
              options={[
                { value: "auto", label: "auto" },
                { value: "128", label: "128k" },
                { value: "96", label: "96k" },
                { value: "64", label: "64k" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv-codec" className="text-xs text-muted-foreground">
              codec
            </Label>
            <OptionSelect
              id="adv-codec"
              value={settings.codec ?? "avc"}
              onChange={(v) => onPatch({ codec: v as Settings["codec"] })}
              options={[
                { value: "avc", label: "H.264 (safe)" },
                ...(vp9 ? [{ value: "vp9", label: "VP9 (webm)" }] : []),
              ]}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
            <Switch
              id="adv-strip"
              checked={settings.stripAudio ?? false}
              onCheckedChange={(v) => onPatch({ stripAudio: v || undefined })}
            />
            <Label htmlFor="adv-strip" className="text-xs text-muted-foreground">
              strip audio
            </Label>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
