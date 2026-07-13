import { Dropzone } from "@/components/dropzone"

export function UploadStep({ onFiles, busy }: { onFiles: (files: File[]) => void; busy: boolean }) {
  return <Dropzone onFiles={onFiles} busy={busy} />
}
