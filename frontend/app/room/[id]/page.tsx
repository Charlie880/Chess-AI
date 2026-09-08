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
  const [checkedAccount, setCheckedAccount] = useState(false)

  // A signed-in visitor already has a name; only guests are asked for one.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.username) setName(data.user.username)
      })
      .catch(() => {})
      .finally(() => setCheckedAccount(true))
  }, [])

  if (joined) {
    return (
      <div className="min-h-screen">
        <header className="flex items-center justify-between border-b border-brass/20 px-5 py-2">
          <Link href="/" className="wide text-[15px] font-semibold tracking-tight hover:text-brass">
            Chess AI
          </Link>
          <span className="text-sm text-graphite">Room {roomId}</span>
        </header>
        <RoomBoard roomId={roomId} name={joined.name} role={joined.role} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-brass/20 px-5 py-2">
        <Link href="/" className="wide text-[15px] font-semibold tracking-tight hover:text-brass">
          Chess AI
        </Link>
      </header>

      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="wide text-2xl font-semibold tracking-tight">You have been invited to a game</h1>
        <p className="mt-2 text-[15px] leading-snug text-graphite">
          Take a seat to play, or join as a spectator to watch the board update as it happens.
        </p>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setJoined({ name: name.trim() || "Guest", role: "play" })
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={checkedAccount ? "Your name" : "…"}
            aria-label="Your name"
            maxLength={24}
            className="border border-rule bg-ink px-3 py-2 text-[15px] placeholder:text-graphite/70 focus:border-brass"
          />
          <button
            type="submit"
            className="bg-brass px-3 py-2 text-[15px] font-semibold text-ink hover:bg-[#D9A64C]"
          >
            Take a seat
          </button>
          <button
            type="button"
            onClick={() => setJoined({ name: name.trim() || "Guest", role: "watch" })}
            className="border border-rule px-3 py-2 text-[15px] text-graphite hover:border-graphite hover:text-chalk"
          >
            Just watch
          </button>
        </form>
      </main>
    </div>
  )
}
