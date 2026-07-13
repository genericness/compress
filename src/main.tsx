import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import "@fontsource-variable/inter"
import "@fontsource-variable/jetbrains-mono"
import "@fontsource/pixelify-sans"
import "./index.css"
import App from "./app.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster theme="dark" position="bottom-right" />
  </StrictMode>,
)
