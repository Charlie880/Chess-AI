"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import GameReplay from "@/components/GameReplay"
import SiteMark from "@/components/SiteMark"

type Game = {
  id: string
  difficulty: string | null
  opponent?: string
  playerColor: "w" | "b"
  moves: string[]
  result: string | null
  termination: string | null
}

export default function GameReplayPage() {
  const params = useParams<{ id: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/games/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Game not found")
        return r.json()
      })
      .then(setGame)
      .catch((err) => {
        setError(err.message)
        setGame(null)
      })
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <header className="border-b border-line bg-white" style={{ padding: "14px clamp(16px, 4vw, 48px)" }}>
          <SiteMark />
        </header>
        <main className="flex flex-1 items-center justify-center">
          <p className="text-slate">Loading game...</p>
        </main>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <header className="border-b border-line bg-white" style={{ padding: "14px clamp(16px, 4vw, 48px)" }}>
          <SiteMark />
        </header>
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="text-center">
            <p className="text-alarm font-bold">{error || "Game not found"}</p>
            <a href="/play/computer" className="mt-4 inline-block text-goldink hover:text-ink font-bold">
              Back to games
            </a>
          </div>
        </main>
      </div>
    )
  }

  return (
    <GameReplay
      gameId={game.id}
      moves={game.moves}
      playerColor={game.playerColor}
      difficulty={game.difficulty as any}
      opponent={game.opponent || "Unknown"}
      result={game.result}
      termination={game.termination}
    />
  )
}
