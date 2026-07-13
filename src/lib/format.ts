// Decimal units on purpose: presets are decimal MB so outputs stay under
// Discord's cap whether it enforces 10^6 or 2^20 per "MB".
export const MB = 1_000_000

export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`
  const units = ["KB", "MB", "GB"]
  let u = -1
  do {
    n /= 1000
    u++
  } while (n >= 1000 && u < units.length - 1)
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[u]}`
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`
}

export function formatBitrate(bps: number): string {
  return bps >= 1_000_000 ? `${(bps / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bps / 1000)} kbps`
}
