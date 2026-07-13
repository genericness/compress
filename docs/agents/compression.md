# compression

How a file becomes a smaller file. Everything here is client-side; no server is involved.

## The planner (`src/lib/plan.ts`)

Pure function `planFor(item, settings) → Plan`. All heuristics and tunables live here — engines just execute plans.

- **Plan kinds**: `passthrough` (already ≤ target), `image`, `video`, `deferred` (duration/dims unknown until ffmpeg probes — GIFs and ffmpeg-only containers), `impossible` (reason string for the UI).
- **Budget**: `budgetBytes = targetBytes × margin`, margin **0.95 fast / 0.97 precise**. Targets are decimal MB (10 MB = 10^6 B) so we undercut Discord's cap in either unit.
- **Audio**: when present and not stripped — 10% of total bitrate, snapped down the ladder 128k → 96k → 64k. Forced to 64k if video would drop under 100 kbps.
- **Quality floor**: bits-per-pixel `bpp = videoBps / (w × h × fps)`; acceptable ≥ **0.045**. To recover a too-low bpp, in order: cap fps at 30 → walk the short-side ladder (1440/1080/720/540/480/360/240, aspect kept, even dims) → cap fps at 24. Below **0.02** bpp at the floor → `impossible`.
- **Overshoot retry** (`retryVideoBps`): one retry at `videoBps × budget/actual × 0.95`. Both engines use it.

Unit tests: `src/lib/plan.test.ts` (`bun test`). Keep the planner pure — no engine imports, no DOM.

## Engine selection (`src/hooks/use-compressor.ts`)

Per file: image plan → canvas. Video plan → mediabunny if `canUseMediabunny()` (input decodable + `canEncodeVideo('avc'|'vp9')` + audio encodable, AAC via `@mediabunny/aac-encoder` registration on Firefox) — else ffmpeg. Deferred plan → always ffmpeg.

## mediabunny path (`src/engines/mediabunny.ts`)

WebCodecs `Conversion` API: numeric bitrate, width/height + `fit:'fill'` (dims pre-computed, aspect-correct), `frameRate`, audio `{discard}` or `{codec, bitrate}`, `Mp4OutputFormat({fastStart:'in-memory'})`. Progress via `conversion.onProgress`, cancel via `conversion.cancel()` wired to the batch AbortSignal. Encode → measure → single retry if over target. VP9 plans output WebM + Opus audio.

## ffmpeg path (`src/engines/ffmpeg.ts`)

For everything WebCodecs can't do: undecodable containers, GIF→MP4, browsers without H.264 encode.

- Core loading: `/ffmpeg/<st|mt>/ffmpeg-core.wasm.gz` → `DecompressionStream` (gzip-magic sniff — dev serves it pre-inflated, prod raw) → blob URL → `ffmpeg.load()`. mt core when `crossOriginIsolated`, st otherwise; `?ffmpeg=st|mt` forces.
- **`-threads 4` on the mt core is load-bearing** — x264 auto-threads deadlocks against the fixed wasm pthread pool.
- Args: `libx264 -profile:v main -pix_fmt yuv420p -preset veryfast -movflags +faststart`, AAC audio. Fast = single pass + `-maxrate/-bufsize`; precise = two-pass (`-passlogfile` in MEMFS, pass 1 → `-f null -`).
- `deferred` plans: `ffmpeg -i` first, parse `Duration:`/`Stream` lines from the log, then plan with the real numbers.
- Progress: parse `time=HH:MM:SS` from log lines against duration (pass 1 → 0–50%, pass 2 → 50–100%). Cancel = `terminate()` + instance reset.
- MEMFS holds input+output in RAM — files are deleted after each job; inputs > ~800 MB on this path are memory-risky.

## image path (`src/engines/image.ts`)

Canvas `toBlob` — no library. Alpha-sampled from pixels; output WebP (JPEG if WebP unsupported; PNG only when input PNG already fits or for alpha without WebP — PNG shrinks by dimension steps since it has no quality knob). Quality binary search q∈[0.30, 0.95], ≤7 iterations, early-stop inside [90%, 100%] of budget; if q=0.30 still over, downscale by `sqrt(budget/size) × 0.95` and re-search (≤3 rounds).

## GIF rules

Fits → passthrough untouched. Over target → MP4 conversion via ffmpeg (mediabunny can't read GIF), UI notes the lost auto-loop embed. We never re-encode GIF-to-GIF.

## Test fixtures

```sh
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=30:duration=30 -f lavfi -i "sine=frequency=440:duration=30" -c:v libx264 -b:v 4M -pix_fmt yuv420p -c:a aac -shortest test-1080p.mp4
ffmpeg -f lavfi -i testsrc2=size=4096x2304 -frames:v 1 -q:v 1 test-big.jpg
ffmpeg -f lavfi -i testsrc2=size=640x480:rate=15:duration=12 test-big.gif
```
Drop them in `public/` for dev (gitignored as `public/test*`); headless chromium (playwright) supports WebCodecs H.264 and SharedArrayBuffer, so both engines are testable there.
