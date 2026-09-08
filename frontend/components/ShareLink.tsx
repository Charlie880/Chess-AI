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
    <div className="px-4 py-3">
      <p className="text-sm text-graphite">Send this link to play or to let someone watch.</p>
      <div className="mt-2 flex gap-2">
        <input
          readOnly
          value={url}
          aria-label="Link to this room"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 border border-rule bg-ink px-2 py-1.5 text-sm text-chalk"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 border border-brass/70 px-3 py-1.5 text-sm font-semibold text-brass hover:bg-brass/10"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}
