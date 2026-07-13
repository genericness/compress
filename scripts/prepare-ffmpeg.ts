// Stages ffmpeg cores into public/ffmpeg/ (gitignored). The wasm is gzipped
// because Cloudflare Workers static assets cap files at 25 MiB and the raw
// core is ~32 MB; the client inflates it with DecompressionStream.
import { mkdirSync } from "node:fs"

const CORES = [
  { pkg: "@ffmpeg/core", dir: "st", files: ["ffmpeg-core.js", "ffmpeg-core.wasm"] },
  { pkg: "@ffmpeg/core-mt", dir: "mt", files: ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"] },
]

for (const core of CORES) {
  const { version } = await Bun.file(`node_modules/${core.pkg}/package.json`).json()
  const dest = `public/ffmpeg/${core.dir}`
  const marker = Bun.file(`${dest}/.version`)
  if ((await marker.exists()) && (await marker.text()) === version) {
    console.log(`ffmpeg ${core.dir} ${version} already staged`)
    continue
  }
  mkdirSync(dest, { recursive: true })
  for (const name of core.files) {
    const bytes = await Bun.file(`node_modules/${core.pkg}/dist/esm/${name}`).bytes()
    if (name.endsWith(".wasm")) {
      const gz = Bun.gzipSync(bytes, { level: 9 })
      await Bun.write(`${dest}/${name}.gz`, gz)
      console.log(`${dest}/${name}.gz (${(gz.length / 1e6).toFixed(1)} MB from ${(bytes.length / 1e6).toFixed(1)} MB)`)
    } else {
      await Bun.write(`${dest}/${name}`, bytes)
    }
  }
  await Bun.write(`${dest}/.version`, version)
}
