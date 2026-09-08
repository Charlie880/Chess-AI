"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

import RoomBoard from "@/components/RoomBoard"

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
    <div className="min-h-screen">
      <header className="border-b border-rule px-6 py-3 sm:px-14">
        <Link href="/" className="wide text-base font-semibold tracking-tight hover:text-brass">
          Chess AI
        </Link>
      </header>

      {/* One centred column and nothing else. */}
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-6 py-16 text-center">
        <p className="text-sm text-brass">You have been invited</p>
        <h1 className="wide mt-3 text-[38px] font-semibold leading-[1.08] tracking-tight sm:text-[46px]">
          A game is waiting
        </h1>
        <p className="mt-4 text-base leading-relaxed text-graphite">
          Take the open seat, or watch the board move by move.
        </p>

        <form
          className="mt-9 flex flex-col gap-3"
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
            className="h-12 border border-rule bg-raise px-3 text-center text-[15px] placeholder:text-graphite/70 focus:border-brass"
          />
          <button
            type="submit"
            className="h-12 bg-brass text-[15px] font-semibold text-ink transition-colors hover:bg-[#E6B75C]"
          >
            Take a seat
          </button>
          <button
            type="button"
            onClick={() => setJoined({ name: name.trim() || "Guest", role: "watch" })}
            className="h-12 text-[15px] text-graphite transition-colors hover:text-chalk"
          >
            Just watch
          </button>
        </form>

        <p className="mt-7 text-sm leading-relaxed text-graphite">
          Your games are saved to this browser. Sign in from the home page to keep them across
          devices.
        </p>
      </main>
    </div>
  )
}
