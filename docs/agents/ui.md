# ui

Single centered card that walks through four steps. No router, no global store — `src/app.tsx` owns `step`, `items`, `settings` and hands everything down as props.

## Shell (`src/app.tsx`)

- Full-height flex column over a static violet radial gradient div (same idiom as the sibling projects' hero fallback — deliberately not an animated background so nothing competes with encoding for CPU).
- Wordmark `compress` in `font-pixel` (Pixelify Sans, the 4x.rip family brand font), muted tagline, then the card, then the footer (`components/footer.tsx` — the muted lowercase "open source" link, copied from read/purgegit).
- Step transitions: card content wrapped in `<AnimatePresence mode="wait">` keyed by step (fade + 16px slide, 0.18s), inside a `<motion.div layout>` so the card height springs between steps.
- Global paste handler (upload/target steps only) feeds the same `addFiles` path as the dropzone.

## Steps (`src/components/steps/`)

- **upload-step** → `dropzone.tsx`: one big `<button>` with drag/drop/click/paste affordances and a hidden `<input type=file multiple>` (that input is what makes mobile tap-to-pick work). Size/type validation happens in `lib/probe.ts`, errors surface as sonner toasts.
- **target-step**: file list (`file-summary.tsx`, removable rows) · elastic slider · custom MB input (1–1000) · fast/precise `ToggleGroup` (guard: ignore empty selection) · `estimate-line.tsx` · `advanced-panel.tsx` (Collapsible; resolution/fps/audio bitrate/codec Selects + strip-audio Switch; VP9 option only rendered when `canEncode('vp9')`).
- **working-step**: overall progress = `(finished + currentProgress) / jobs`, stage + percent line, cancel, `log-terminal.tsx` (collapsed by default, JetBrains Mono, auto-scrolls, keeps last 500 lines).
- **done-step**: single-file layout (size before→after + % badge, inline `<video>`/`<img>` preview with original↔compressed toggle, big download) or batch list (per-row download + "download all" which clicks sequentially, 350ms apart). Failed jobs render as destructive rows.

## The slider (`src/components/elastic-slider.tsx`)

Vendored from react-bits' ElasticSlider and reworked — treat it as ours:

- **Controlled** (`value`/`onChange` in MB) instead of the upstream uncontrolled `defaultValue`.
- **Log scale** (1–500 MB) so 10/50/100/500 presets spread evenly; `toPos`/`toMB` convert.
- **Magnetic presets**: during drag the thumb locks onto a preset within `MAGNET` (0.035 of track); release always springs (`stiffness 380, damping 28`) onto the nearest preset. Arbitrary values only come from the custom input; external value changes settle the thumb via the same spring.
- Upstream elastic charm kept: sigmoid `decay` overflow at the edges drives scaleX/scaleY/transform-origin, track grows on hover/touch.
- Keyboard: ArrowLeft/Right step between presets; `role="slider"` + aria-value* set.
- Preset tick labels hide their tier sub-label below `sm` (they collide on phones).

## Conventions

- Theme tokens only — no hardcoded colors. Fonts via `--font-sans/mono/pixel` (Fontsource, imported in `main.tsx` before `index.css`).
- Copy is lowercase, plain verbs ("drop files here", "start over"). Errors say what happened and what to try next.
- shadcn base-nova (Base UI) components in `components/ui/` — check their prop shapes before use (ToggleGroup takes array values; Tooltip triggers take a `render` prop; Select accepts `items`).
- Motion: don't animate a property Tailwind also transitions; springs use either stiffness/damping or bounce/duration, never mixed.
