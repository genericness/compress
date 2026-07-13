# CLAUDE.md

Keep this file high-signal — it's loaded into every agent session. Deeper per-area docs live in `docs/agents/`.

## What this is

**compress** — compress.4x.rip. Client-side media compressor: drop an image/video, pick a Discord size preset (10/50/100/500 MB), get a file that fits. Everything runs in the browser (WebCodecs or wasm) — there is **no server processing, no upload, no worker code**. Cloudflare serves static assets only.

## Stack & commands

- bun + Vite + React 19 + TS strict. Tailwind v4 (no config file — theme lives in `src/index.css`). shadcn/ui style `base-nova` (Base UI primitives, NOT Radix). motion (`motion/react`) for animation. lucide icons, sonner toasts.
- `bun run dev` — dev server (sets COOP/COEP headers, see constraints)
- `bun test` — planner unit tests (`src/lib/plan.test.ts`)
- `bun run build` — tsc + vite build into `dist/`
- `bun run deploy` — build + `wrangler deploy` (assets-only worker, custom domain compress.4x.rip)
- `bun install` runs `scripts/prepare-ffmpeg.ts` (postinstall) — stages gzipped ffmpeg cores into `public/ffmpeg/` (gitignored)

## Git conventions

- Conventional commits, lowercase, no scopes: `feat: …`, `fix: …`, `chore: …`, `docs: …`. One logical change per commit, push each commit.
- **Never add Claude/AI attribution to commits** — no `Co-Authored-By`, no "Generated with" lines, anywhere, ever.

## Architecture map

Single page, no router, no server state. One card walks through steps `upload → target → working → done` (`src/app.tsx` owns the step state).

- `src/lib/probe.ts` — file → `MediaItem` (kind, dims, duration, fps, hasAudio, decodable). Video meta via mediabunny `Input`; images via `createImageBitmap`. Rejects > 1.5 GB.
- `src/lib/plan.ts` — THE brain. Pure planner: target bytes + item → `Plan` (passthrough | image | video | deferred | impossible) with bitrates, downscale, fps. All tunables live here. Tested in `plan.test.ts`; keep it pure.
- `src/engines/` — three interchangeable compressors behind one callback shape (`types.ts`):
  - `mediabunny.ts` — primary video path (WebCodecs, hardware, fast). Gate: `canUseMediabunny()`.
  - `ffmpeg.ts` — fallback video path + GIF→MP4 + unknown containers (`deferred` plans probe duration via ffmpeg log). Lazy-loads ~10 MB gz core on first use.
  - `image.ts` — canvas `toBlob` quality binary search (no library).
- `src/hooks/use-compressor.ts` — job queue; runs items sequentially, one AbortController per batch, picks the engine per file.
- `src/components/steps/*` — one file per card step. `elastic-slider.tsx` is a vendored/reworked react-bits component (log scale, magnetic presets).

## Non-obvious constraints (read before touching)

- **COOP/COEP everywhere**: the site is cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) so ffmpeg's multithreaded core gets SharedArrayBuffer. Set in `vite.config.ts` (dev) AND `public/_headers` (prod). Any third-party script/resource must be CORS-loaded (`crossorigin` attr + ACAO header) or it will be blocked.
- **Cloudflare caps static assets at 25 MiB/file** — `ffmpeg-core.wasm` is 32 MB, so `scripts/prepare-ffmpeg.ts` stores it gzipped (~10 MB) and `engines/ffmpeg.ts` inflates via `DecompressionStream`, sniffing the gzip magic because vite dev serves `.gz` with `Content-Encoding: gzip` (already inflated) while Cloudflare serves it raw.
- **x264 deadlocks on the mt core without `-threads 4`** — the wasm pthread pool is fixed; auto-threads hangs forever. Don't remove the cap. `?ffmpeg=st|mt` URL param forces a core for debugging.
- **Two-pass x264 works in MEMFS** (`-passlogfile pl`) — verified; `precise` mode relies on it.
- **Discord targets use decimal MB** (10 MB = 10^6 bytes) on purpose — outputs stay under the cap whichever unit Discord enforces. Margins: fast 0.95 / precise 0.97 of target.
- **Outputs must embed on Discord**: H.264 yuv420p MP4 +faststart (mediabunny hw encoders emit 4:2:0; ffmpeg path forces `-pix_fmt yuv420p -profile:v main -movflags +faststart`). Images only ever become JPEG/PNG/WebP. Don't output anything exotic.
- Engines are `import()`ed lazily and mediabunny is in `optimizeDeps.include` — first-use full-page reloads in dev otherwise.

## Verifying changes

- `bun test && bun run build` must pass.
- Real-flow check: `bun run dev`, then drive it with playwright (chromium supports WebCodecs H.264 + SAB here) — see `docs/agents/compression.md` for the fixture recipe (`ffmpeg -f lavfi -i testsrc2=…`). Compress a >10 MB video to 10 MB, check the output is under target and plays.
- After deploy: `curl -I https://compress.4x.rip` → expect COOP/COEP + cache headers; in console `crossOriginIsolated === true`.
