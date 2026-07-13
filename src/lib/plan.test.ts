import { describe, expect, it } from "bun:test"
import { planFor, planVideo, retryVideoBps, type Settings, type VideoPlan } from "./plan"
import type { MediaItem } from "./probe"

const video = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: "t",
  file: { size: 100_000_000, name: "t.mp4" } as File,
  kind: "video",
  width: 1920,
  height: 1080,
  duration: 60,
  fps: 30,
  hasAudio: true,
  decodable: true,
  ...over,
})

const settings = (over: Partial<Settings> = {}): Settings => ({
  targetBytes: 10_000_000,
  speed: "fast",
  ...over,
})

describe("planFor", () => {
  it("passes through when the file already fits", () => {
    const item = video({ file: { size: 9_000_000, name: "t.mp4" } as File })
    expect(planFor(item, settings()).kind).toBe("passthrough")
  })

  it("defers when duration is unknown", () => {
    expect(planVideo(video({ duration: undefined }), settings()).kind).toBe("deferred")
  })
})

describe("planVideo", () => {
  it("computes bitrates within the budget", () => {
    const plan = planVideo(video({ duration: 10, width: 1280, height: 720 }), settings()) as VideoPlan
    expect(plan.kind).toBe("video")
    // total = 10MB * 0.95 * 8 / 10s = 7.6Mbps
    expect(plan.videoBps + plan.audioBps).toBeCloseTo(7_600_000, -4)
    expect(plan.audioBps).toBe(128_000)
    expect(plan.width).toBeUndefined() // plenty of bits — no downscale
  })

  it("downscales long 1080p to keep quality acceptable", () => {
    const plan = planVideo(video(), settings()) as VideoPlan
    // ~1.17Mbps for 1080p30 is 0.019 bpp -> must scale down
    expect(plan.kind).toBe("video")
    expect(plan.height).toBeDefined()
    expect(plan.height!).toBeLessThan(1080)
    expect(plan.width! % 2).toBe(0)
    expect(plan.height! % 2).toBe(0)
  })

  it("uses the short side for portrait video", () => {
    const plan = planVideo(video({ width: 1080, height: 1920 }), settings()) as VideoPlan
    expect(plan.kind).toBe("video")
    expect(plan.width!).toBeLessThan(1080)
    expect(plan.width!).toBeLessThan(plan.height!)
  })

  it("strips audio when asked", () => {
    const plan = planVideo(video(), settings({ stripAudio: true })) as VideoPlan
    expect(plan.audioBps).toBe(0)
  })

  it("declares hopeless targets impossible", () => {
    const plan = planVideo(video({ duration: 7200 }), settings({ targetBytes: 1_000_000 }))
    expect(plan.kind).toBe("impossible")
  })

  it("precise mode gets a tighter margin and two passes", () => {
    const plan = planVideo(video({ duration: 10 }), settings({ speed: "precise" })) as VideoPlan
    expect(plan.budgetBytes).toBe(9_700_000)
    expect(plan.twoPass).toBe(true)
  })
})

describe("retryVideoBps", () => {
  it("scales the bitrate down proportionally to the overshoot", () => {
    const plan = planVideo(video({ duration: 10 }), settings()) as VideoPlan
    const retry = retryVideoBps(plan, 11_000_000)
    expect(retry).toBeLessThan(plan.videoBps)
    expect(retry).toBeGreaterThan(plan.videoBps * 0.7)
  })
})
