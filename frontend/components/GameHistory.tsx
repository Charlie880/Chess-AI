"use client"

import { useCallback, useEffect, useState } from "react"
import { ENGINES, type Difficulty } from "@/lib/engines"
import { cn } from "@/lib/utils"

export type GameRecord = {
  id: string
  difficulty: Difficulty
  playerColor: "w" | "b"
  moves: string[]
  status: "in_progress" | "finished"
  outcome: "win" | "loss" | "draw" | null
  result: string | null
  termination: string | null
  startedAt: string
}

type Stats = { win: number; loss: number; draw: number; finished: number; total: number }

const OUTCOME_TEXT: Record<string, string> = {
  win: "text-moss",
  loss: "text-alarm",
  draw: "text-graphite",
}

const OUTCOME_LABEL: Record<string, string> = { win: "Won", loss: "Lost", draw: "Drew" }

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
      if (!gamesResponse.ok || !statsResponse.ok) throw new Error("History is unavailable right now.")
      setGames(await gamesResponse.json())
      setStats(await statsResponse.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "History is unavailable right now.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return (
    <div>
      {stats && stats.finished > 0 && (
        <p className="figures border-b border-rule px-4 py-2.5 text-[15px]">
          <span className="text-moss">{stats.win} won</span>
          <span className="text-graphite">, </span>
          <span className="text-alarm">{stats.loss} lost</span>
          <span className="text-graphite">, {stats.draw} drawn</span>
        </p>
      )}

      <div className="max-h-52 overflow-y-auto">
        {error && <p className="px-4 py-3 text-sm text-alarm">{error}</p>}

        {!error && games.length === 0 && (
          <p className="px-4 py-3 text-sm leading-snug text-graphite">
            No games yet. Play one through and it lands here with its result.
          </p>
        )}

        {games.map((game) => (
          <div
            key={game.id}
            className="grid grid-cols-[4.2rem_1fr_auto] items-baseline gap-2 border-b border-rule/50 px-4 py-2 text-sm last:border-b-0"
          >
            <span
              className={cn(
                "font-semibold",
                game.outcome ? OUTCOME_TEXT[game.outcome] : "text-graphite",
              )}
            >
              {game.status === "in_progress"
                ? "Playing"
                : (OUTCOME_LABEL[game.outcome ?? ""] ?? "Unfinished")}
            </span>
            <span className="truncate text-graphite">
              {ENGINES[game.difficulty]?.opponent ?? game.difficulty} as{" "}
              {game.playerColor === "w" ? "white" : "black"}
            </span>
            <span className="figures text-graphite">{Math.ceil(game.moves.length / 2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
