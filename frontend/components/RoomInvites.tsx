"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface RoomInvitesProps {
  roomId: string
  /** Only the host invites. The right passes to whoever is still seated. */
  canInvite: boolean
  /** A play invitation is pointless while both seats are taken. */
  seatOpen: boolean
}

type Kind = "play" | "watch"

const LABEL: Record<Kind, string> = { play: "To play", watch: "To watch" }

export default function RoomInvites({ roomId, canInvite, seatOpen }: RoomInvitesProps) {
  const [links, setLinks] = useState<Partial<Record<Kind, string>>>({})
  const [copied, setCopied] = useState<Kind | null>(null)
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const make = async (kind: Kind) => {
    setBusy(kind)
    setError(null)
    try {
      const response = await fetch(`/api/rooms/${roomId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not make an invitation")
      setLinks((all) => ({ ...all, [kind]: `${location.origin}/join/${data.token}` }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make an invitation")
    } finally {
      setBusy(null)
    }
  }

  const copy = async (kind: Kind) => {
    const link = links[kind]
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      // Clipboard access can be refused; the link is on screen either way.
    }
  }

  if (!canInvite) return null

  return (
    <div className="rounded-xl border border-gold bg-goldwash p-[18px]">
      <p className="text-[11px] font-bold tracking-[0.16em] text-goldink">INVITE</p>
      <p className="mt-2 text-[13px] leading-[1.5] text-goldink">
        One person can play. Anyone you send a watch link to can watch.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {(["play", "watch"] as Kind[]).map((kind) => (
          <div key={kind}>
            {links[kind] ? (
              <div className="flex items-center gap-3">
                <input
                  readOnly
                  value={links[kind]}
                  aria-label={`Link to ${kind === "play" ? "play" : "watch"}`}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 border-none bg-transparent p-0 text-[13px] text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={() => copy(kind)}
                  className="shrink-0 text-[13px] font-bold text-goldink transition-colors hover:text-ink"
                >
                  {copied === kind ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void make(kind)}
                disabled={busy !== null || (kind === "play" && !seatOpen)}
                title={
                  kind === "play" && !seatOpen
                    ? "Both seats are taken, so a play invitation would not work"
                    : undefined
                }
                className={cn(
                  "text-[13px] font-bold text-goldink transition-colors hover:text-ink",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-goldink",
                )}
              >
                {busy === kind ? "Making a link…" : `${LABEL[kind]} →`}
              </button>
            )}
          </div>
        ))}
      </div>

      {!seatOpen && (
        <p className="mt-3 text-[13px] leading-[1.5] text-goldink/80">
          Both seats are taken, so a play link will be refused until one opens up.
        </p>
      )}
      {error && <p className="mt-3 text-[13px] text-alarm">{error}</p>}
    </div>
  )
}
