"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import RoomBoard from "@/components/RoomBoard"
import SiteMark from "@/components/SiteMark"

export default function RoomPage() {
  const params = useParams<{ id: string }>()
  const roomId = params.id

  const [name, setName] = useState("")
  const [joined, setJoined] = useState<{ name: string; role: "play" | "watch" } | null>(null)

  // A visitor already has an identity by the time they get here - the invite
  // just confirms what to call them.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.username) setName(data.user.username)
      })
      .catch(() => {})
  }, [])

  if (joined) {
    return <RoomBoard roomId={roomId} name={joined.name} role={joined.role} />
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="border-b border-line bg-white"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <section className="w-full max-w-[420px] text-center">
          <p className="text-[11px] font-bold tracking-[0.16em] text-mute">YOU HAVE BEEN INVITED</p>
          <h1 className="mt-3 font-display text-[44px] font-medium leading-[1.05] tracking-[-0.015em]">
            A game is waiting
          </h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-slate">
            Take the open seat, or watch the board move by move.
          </p>

          <form
            className="mt-8 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              setJoined({ name: name.trim() || "Guest", role: "play" })
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              maxLength={24}
              className="h-12 rounded-lg border border-field bg-white px-3 text-center text-[14px] placeholder:text-mute focus:border-gold"
            />
            <button
              type="submit"
              className="h-12 rounded-lg bg-ink text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b]"
            >
              TAKE A SEAT
            </button>
            <button
              type="button"
              onClick={() => setJoined({ name: name.trim() || "Guest", role: "watch" })}
              className="h-12 rounded-lg border border-field bg-white text-[13px] font-semibold text-ink transition-colors hover:border-ink"
            >
              Just watch
            </button>
          </form>

          <p className="mt-6 text-[13px] leading-[1.5] text-mute">
            Your games are saved to this browser. Sign in from the home page to keep them across
            devices.
          </p>
        </section>
      </main>
    </div>
  )
}
