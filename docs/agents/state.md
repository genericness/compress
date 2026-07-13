# state

There is no store, no context, no server state. Two owners:

## `src/app.tsx` — flow state

- `step: "upload" | "target" | "working" | "done"` — which card face is showing.
- `items: MediaItem[]` — probed files (see `lib/probe.ts`). Adding files during upload/target appends (that's how batch happens — no mode switch); removing the last item returns to upload.
- `settings: Settings` — target bytes + speed + advanced overrides, patched immutably via `patchSettings`. Lives here so it survives step changes and applies to the whole batch.
- `start()` → `setStep("working")`, `await run(items, settings)`, then `done` — or back to `target` when the run was cancelled (files are kept so the user can retry).

## `src/hooks/use-compressor.ts` — job state

- `jobs: Job[]` — one per item: `status (queued|running|done|error|cancelled)`, `progress 0..1`, `stage`, `engine`, `result {blob, name}`, `error`, `overTarget`.
- `logs: string[]` — one shared, capped (500) line buffer for the whole batch; the log terminal renders it directly.
- `run()` processes items **sequentially** (one encode at a time — deliberate: parallel encodes would fight for cores/memory) and picks the engine per file (see compression.md). Resolves `true` if it ran to the end, `false` if cancelled.
- One `AbortController` per batch: `cancel()` aborts the current engine (mediabunny `conversion.cancel()`, ffmpeg `terminate()`) and marks remaining jobs cancelled. Engines re-check `signal.aborted` right after attaching their abort listeners — a signal that aborted earlier never fires the event (that was a real bug; keep the checks).
- Output naming: `{base}-{target}mb.{ext}` (ext from blob MIME); passthrough keeps the original name.

Job updates go through functional `setState` (`patch(id, partial)`) — no stale-closure hazards; engines report via callbacks (`onProgress/onStage/onLog`), never touch state directly.
