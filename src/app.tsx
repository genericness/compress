import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Footer } from "@/components/footer"
import { UploadStep } from "@/components/steps/upload-step"
import { FileSummary } from "@/components/file-summary"
import { probe, type MediaItem } from "@/lib/probe"

export type Step = "upload" | "target" | "working" | "done"

export default function App() {
  const [step, setStep] = useState<Step>("upload")
  const [items, setItems] = useState<MediaItem[]>([])
  const [probing, setProbing] = useState(false)

  async function addFiles(files: File[]) {
    setProbing(true)
    const results = await Promise.allSettled(files.map(probe))
    setProbing(false)
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value)
    for (const r of results) {
      if (r.status === "rejected") toast.error(String(r.reason instanceof Error ? r.reason.message : r.reason))
    }
    if (ok.length) {
      setItems((prev) => [...prev, ...ok])
      setStep((s) => (s === "upload" ? "target" : s))
    }
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      if (next.length === 0) setStep("upload")
      return next
    })
  }

  // Paste works anywhere on the page while picking files
  useEffect(() => {
    if (step !== "upload" && step !== "target") return
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) addFiles(files)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <div className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_30%,color-mix(in_oklch,var(--primary),transparent_85%)_0%,transparent_72%)]"
      />
      <main className="relative z-10 flex w-full max-w-xl flex-col items-center">
        <h1 className="font-pixel text-4xl tracking-tight text-foreground sm:text-5xl">compress</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          shrink images and videos to discord's upload limits — nothing leaves your browser
        </p>
        <motion.div layout className="mt-8 w-full">
          <Card className="w-full overflow-hidden py-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="p-5 sm:p-6"
              >
                {step === "upload" && <UploadStep onFiles={addFiles} busy={probing} />}
                {step === "target" && <FileSummary items={items} onRemove={removeItem} />}
              </motion.div>
            </AnimatePresence>
          </Card>
        </motion.div>
        <Footer />
      </main>
    </div>
  )
}
