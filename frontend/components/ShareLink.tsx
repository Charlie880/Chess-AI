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
    <div className="mt-8 border-t border-rule pt-5">
      <p className="text-sm leading-relaxed text-graphite">
        Anyone with this link can take a seat or watch.
      </p>
      <div className="mt-2.5 flex items-center gap-3">
        <input
          readOnly
          value={url}
          aria-label="Link to this room"
          onFocus={(e) => e.currentTarget.select()}
          className="figures min-w-0 flex-1 border-none bg-transparent p-0 text-sm text-chalk outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-[15px] font-semibold text-brass transition-colors hover:text-[#E6B75C]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}
