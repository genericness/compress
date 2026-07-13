import { useEffect, useRef } from "react"
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react"
import { cn } from "@/lib/utils"

// Adapted from react-bits ElasticSlider: keeps the elastic edge-overflow and
// grow-on-hover, adds a controlled value, a log scale, and magnetic presets.

const MAX_OVERFLOW = 50
/** distance (fraction of track) inside which the thumb locks onto a preset */
const MAGNET = 0.035
const SETTLE = { type: "spring", stiffness: 380, damping: 28 } as const

export interface SliderPreset {
  mb: number
  label: string
}

function decay(value: number, max: number): number {
  if (max === 0) return 0
  const entry = value / max
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5)
  return sigmoid * max
}

export function ElasticSlider({
  value,
  onChange,
  presets,
  min = 1,
  max = 500,
  className,
}: {
  value: number
  onChange: (mb: number) => void
  presets: SliderPreset[]
  min?: number
  max?: number
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const toPos = (mb: number) => Math.min(1, Math.max(0, Math.log(mb / min) / Math.log(max / min)))
  const toMB = (p: number) => min * Math.pow(max / min, p)

  const pos = useMotionValue(toPos(value))
  const clientX = useMotionValue(0)
  const overflow = useMotionValue(0)
  const scale = useMotionValue(1)

  // external changes (custom input, presets clicked elsewhere) settle the thumb
  useEffect(() => {
    if (!dragging.current) animate(pos, toPos(value), SETTLE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useMotionValueEvent(clientX, "change", (latest) => {
    if (!trackRef.current) return
    const { left, right } = trackRef.current.getBoundingClientRect()
    const amount = latest < left ? left - latest : latest > right ? latest - right : 0
    overflow.jump(decay(amount, MAX_OVERFLOW))
  })

  function posFromPointer(e: React.PointerEvent): number {
    const { left, width } = trackRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - left) / width))
  }

  function magnetize(p: number): number {
    for (const preset of presets) {
      const pp = toPos(preset.mb)
      if (Math.abs(p - pp) < MAGNET) return pp
    }
    return p
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0 || !trackRef.current) return
    dragging.current = true
    const p = magnetize(posFromPointer(e))
    pos.jump(p)
    clientX.jump(e.clientX)
    onChange(Math.round(toMB(p)))
  }

  function settleTo(mb: number) {
    animate(pos, toPos(mb), SETTLE)
    onChange(mb)
  }

  function handlePointerUp() {
    if (!dragging.current) return
    dragging.current = false
    const p = pos.get()
    const nearest = presets.reduce((a, b) => (Math.abs(toPos(b.mb) - p) < Math.abs(toPos(a.mb) - p) ? b : a))
    settleTo(nearest.mb)
    animate(overflow, 0, { type: "spring", bounce: 0.5 })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const sorted = [...presets].sort((a, b) => a.mb - b.mb)
    const idx = sorted.findIndex((p) => p.mb >= value)
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault()
      settleTo(sorted[Math.min(sorted.length - 1, Math.max(0, idx + (sorted[idx]?.mb === value ? 1 : 0)))].mb)
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault()
      settleTo(sorted[Math.max(0, idx - 1)].mb)
    }
  }

  const fillWidth = useTransform(pos, (p) => `${p * 100}%`)
  const thumbLeft = useTransform(pos, (p) => `${p * 100}%`)

  return (
    <div className={cn("w-full", className)}>
      <motion.div
        onHoverStart={() => animate(scale, 1.15)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.15)}
        onTouchEnd={() => animate(scale, 1)}
        style={{ scale, opacity: useTransform(scale, [1, 1.15], [0.85, 1]) }}
        className="flex w-full touch-none select-none items-center"
      >
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="target size"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Math.round(value)}
          aria-valuetext={`${Math.round(value)} megabytes`}
          className="relative flex w-full grow cursor-grab touch-none select-none items-center py-4 focus-visible:outline-none"
          onPointerMove={handlePointerMove}
          onPointerDown={(e) => {
            handlePointerMove(e)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (!trackRef.current) return 1
                return 1 + overflow.get() / trackRef.current.getBoundingClientRect().width
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (!trackRef.current) return "center"
                const { left, width } = trackRef.current.getBoundingClientRect()
                return clientX.get() < left + width / 2 ? "right" : "left"
              }),
              height: useTransform(scale, [1, 1.15], [6, 10]),
              marginTop: useTransform(scale, [1, 1.15], [0, -2]),
              marginBottom: useTransform(scale, [1, 1.15], [0, -2]),
            }}
            className="flex grow"
          >
            <div className="relative h-full grow overflow-hidden rounded-full bg-secondary">
              <motion.div className="absolute h-full rounded-full bg-primary" style={{ width: fillWidth }} />
            </div>
          </motion.div>
          <motion.div
            aria-hidden
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm ring-2 ring-background"
            style={{ left: thumbLeft }}
          />
          {/* focus ring for keyboard users */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-md in-focus-visible:outline-2 in-focus-visible:outline-ring/70" />
        </div>
      </motion.div>

      <div className="relative mt-1 h-9">
        {presets.map((preset) => (
          <button
            key={preset.mb}
            type="button"
            onClick={() => settleTo(preset.mb)}
            className={cn(
              "absolute flex flex-col gap-0.5 pt-1 text-center transition-colors",
              toPos(preset.mb) > 0.9 ? "-translate-x-full items-end" : "-translate-x-1/2 items-center",
              value === preset.mb ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
            )}
            style={{ left: `${toPos(preset.mb) * 100}%` }}
          >
            <span className="font-mono text-[11px] leading-none">{preset.mb}MB</span>
            <span className="hidden text-[10px] leading-tight whitespace-nowrap sm:block">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
