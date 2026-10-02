"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import GameReplay, { type ReplayGame } from "@/components/GameReplay"
import SiteMark from "@/components/SiteMark"

type Loaded = ReplayGame & { chat: ReplayGame["chat"] }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line bg-white" style={{ padding: "14px clamp(16px, 4vw, 48px)" }}>
        <SiteMark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4">{children}</main>
    </div>
  )
}

export default function GameReplayPage() {
  const params = useParams<{ id: string }>()
  const [game, setGame] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
      .catch((err: Error) => setError(err.message))
  }, [params.id])

  if (error) {
    return (
      <Shell>
        <div className="text-center">
          <p className="font-bold text-alarm">{error}</p>
          <Link href="/games" className="mt-4 inline-block font-bold text-goldink hover:text-ink">
            Browse games
          </Link>
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
