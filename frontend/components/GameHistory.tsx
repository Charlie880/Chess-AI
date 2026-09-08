"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type GameRecord = {
  id: string
  difficulty: string
  playerColor: "w" | "b"
  moves: string[]
  status: "in_progress" | "finished"
  outcome: "win" | "loss" | "draw" | null
  result: string | null
  termination: string | null
  startedAt: string
}

type Stats = { win: number; loss: number; draw: number; finished: number; total: number }

const OUTCOME_STYLES: Record<string, string> = {
  win: "text-emerald-400",
  loss: "text-red-400",
  draw: "text-neutral-400",
}

/** Bumping this key from the parent re-fetches after a game finishes. */
export default function GameHistory({ refreshKey }: { refreshKey: number }) {
  const [games, setGames] = useState<GameRecord[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [gamesResponse, statsResponse] = await Promise.all([
        fetch("/api/games?limit=25"),
        fetch("/api/games/stats"),
      ])
      if (!gamesResponse.ok || !statsResponse.ok) throw new Error("Could not load history")
      setGames(await gamesResponse.json())
      setStats(await statsResponse.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">History</span>
        {stats && (
          <span className="font-mono text-xs text-neutral-400">
            <span className="text-emerald-400">{stats.win}W</span>
            {" / "}
            <span className="text-red-400">{stats.loss}L</span>
            {" / "}
            <span>{stats.draw}D</span>
          </span>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto">
        {error && <p className="p-3 text-sm text-red-400">{error}</p>}
        {!error && games.length === 0 && (
          <p className="p-3 text-sm text-neutral-500">No games recorded yet.</p>
        )}
        {games.map((game, i) => (
          <div
            key={game.id}
            className={cn(
              "flex items-baseline gap-2 px-3 py-1.5 text-sm",
              i % 2 === 1 && "bg-neutral-800/40",
            )}
          >
            <span
              className={cn(
                "w-14 font-semibold",
                game.outcome ? OUTCOME_STYLES[game.outcome] : "text-neutral-500",
              )}
            >
              {game.status === "in_progress" ? "open" : (game.outcome ?? "—")}
            </span>
            <span className="w-14 text-neutral-400">{game.difficulty}</span>
            <span className="w-10 text-neutral-500">{game.playerColor === "w" ? "white" : "black"}</span>
            <span className="ml-auto font-mono text-xs text-neutral-500">
              {Math.ceil(game.moves.length / 2)} moves
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
