import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// direct read — the package's exports map hides its package.json
const ffmpegCoreVersion: string = JSON.parse(
  readFileSync(new URL("./node_modules/@ffmpeg/core/package.json", import.meta.url), "utf8"),
).version

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __FFMPEG_CORE_VERSION__: JSON.stringify(ffmpegCoreVersion) },
  resolve: { alias: { "@": "/src" } },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    include: ["mediabunny", "@mediabunny/aac-encoder"],
  },
  // SharedArrayBuffer for multithreaded ffmpeg.wasm — mirrors public/_headers in prod
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
})
