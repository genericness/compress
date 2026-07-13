import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Card } from "@/components/ui/card"
import { Footer } from "@/components/footer"

export type Step = "upload" | "target" | "working" | "done"

export default function App() {
  const [step] = useState<Step>("upload")

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
                <div className="text-sm text-muted-foreground">…</div>
              </motion.div>
            </AnimatePresence>
          </Card>
        </motion.div>
        <Footer />
      </main>
    </div>
  )
}
