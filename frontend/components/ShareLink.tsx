"use client"

import { useEffect, useState } from "react"

/** The link is the whole invitation, so it is shown in full rather than hidden
 * behind a copy button that gives no clue what it copied. */
export default function ShareLink({ roomId }: { roomId: string }) {
  const [url, setUrl] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(`${location.origin}/room/${roomId}`)
  }, [roomId])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused; the link is on screen either way.
    }
  }

  return (
    <div className="rounded-xl border border-gold bg-goldwash p-[18px]">
      <p className="text-[13px] leading-[1.5] text-goldink">
        Anyone with this link can take a seat or watch.
      </p>
      <div className="mt-2.5 flex items-center gap-3">
        <input
          readOnly
          value={url}
          aria-label="Link to this room"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 border-none bg-transparent p-0 text-[13px] text-ink outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-[13px] font-bold text-goldink transition-colors hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}
