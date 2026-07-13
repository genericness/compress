# deploy

Cloudflare Workers **static assets only** — there is no worker script, no `main`, no server code. `wrangler.jsonc` is the whole config: assets from `./dist`, custom domain `compress.4x.rip` (the route creates/owns the DNS record in the 4x.rip zone).

```sh
bun run deploy   # vite build && wrangler deploy
```

## Headers (`public/_headers`, copied into dist/)

- `/*` → `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. This makes the site cross-origin isolated so `SharedArrayBuffer` exists and the multithreaded ffmpeg core runs. **Consequence**: every cross-origin subresource must opt in via CORS (`crossorigin` attribute + `Access-Control-Allow-Origin`) or the browser blocks it. palantir analytics echoes ACAO, so its tag carries `crossorigin` (currently commented out in `index.html` until the site id exists).
- `/assets/*` and `/ffmpeg/*` → `public, max-age=31536000, immutable`. Vite hashes `/assets/*`; `/ffmpeg/*` is safe because the path embeds the core version.
- Dev parity: the same COOP/COEP pair is set in `vite.config.ts` (`server.headers` + `preview.headers`).

## The ffmpeg core pipeline

**Constraint: Cloudflare caps static asset files at 25 MiB; `ffmpeg-core.wasm` is ~32 MB.**

1. `bun install` → postinstall runs `scripts/prepare-ffmpeg.ts`: gzips both cores (st + mt) from node_modules into `public/ffmpeg/<version>/{st,mt}/` (~10 MB each, gitignored), copies the small `.js`/`.worker.js` raw, deletes stale version dirs.
2. `vite.config.ts` bakes the core version in as `__FFMPEG_CORE_VERSION__` (read straight from `node_modules/@ffmpeg/core/package.json` — its exports map hides the file from import).
3. At runtime `src/engines/ffmpeg.ts` fetches `ffmpeg-core.wasm.gz`, sniffs the gzip magic (vite dev serves it with `Content-Encoding: gzip` → already inflated; Cloudflare serves the raw gzip), inflates with `DecompressionStream`, and hands blob URLs to `ffmpeg.load()`.

Core upgrades: bump `@ffmpeg/core`/`@ffmpeg/core-mt`, `bun install`, deploy — the versioned path busts the immutable cache automatically.

## Known quirks

- HEAD requests to `/` return 500 from CF assets (browsers only GET — harmless, but don't let a health check use HEAD).
- `index.html` requests 307 to `/`; unknown paths 404 (no `not_found_handling` configured — the app is a single page at `/`, so that's correct; add `"not_found_handling": "single-page-application"` if routes ever appear).
- Post-deploy check: `curl -s -D - -o /dev/null https://compress.4x.rip` → 200 + both COOP/COEP headers; in the console `crossOriginIsolated === true`.
