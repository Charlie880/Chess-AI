"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"

import BackLink from "@/components/BackLink"
import GameReplay, { type ReplayGame } from "@/components/GameReplay"
import SiteMark from "@/components/SiteMark"

type Loaded = ReplayGame & { chat: ReplayGame["chat"] }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="flex items-center justify-between border-b border-line bg-white"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />
        <BackLink href="/games">All games</BackLink>
      </header>
      <main className="flex flex-1 items-center justify-center px-4">{children}</main>
    </div>
  )
}

export default function GameReplayPage() {
  const params = useParams<{ id: string }>()
  const [game, setGame] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    setGame(null)
    fetch(`/api/games/${params.id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error ?? "Game not found")
        return data
      })
      .then((data) =>
        setGame({
          id: data.id,
          moves: data.moves,
          moveTimes: data.moveTimes ?? [],
          chat: data.chat ?? [],
          playerColor: data.playerColor,
          opponent: data.opponent ?? "Opponent",
          whiteName: data.whiteName ?? null,
          blackName: data.blackName ?? null,
          result: data.result,
          termination: data.termination,
        }),
      )
      .catch((err: Error) => setError(err.message || "Could not load this game."))
  }, [params.id])

  useEffect(load, [load])

  if (error) {
    return (
      <Shell>
        <div className="text-center">
          <p className="font-bold text-alarm">{error}</p>
          <p className="mt-1 text-[13px] text-mute">It may have been removed, or the server is unreachable.</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 text-[13px] font-bold text-ink underline decoration-gold underline-offset-4"
          >
            Try again
          </button>
        </div>
      </Shell>
    )
  }
  if (!game) {
    return (
      <Shell>
        <p className="text-slate">Loading game…</p>
      </Shell>
    )
  }
  return <GameReplay game={game} />
}
