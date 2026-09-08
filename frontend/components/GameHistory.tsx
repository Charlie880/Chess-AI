"use client"

import { useCallback, useEffect, useState } from "react"
import { ENGINES, type Difficulty } from "@/lib/engines"
import { cn } from "@/lib/utils"

export type GameRecord = {
  id: string
  mode?: "engine" | "room"
  difficulty: Difficulty | null
  opponent?: string
  playerColor: "w" | "b"
  moves: string[]
  status: "in_progress" | "finished"
  outcome: "win" | "loss" | "draw" | null
  result: string | null
  termination: string | null
  startedAt: string
}

type Stats = { win: number; loss: number; draw: number; finished: number; total: number }

const OUTCOME_LABEL: Record<string, string> = { win: "Won", loss: "Lost", draw: "Drew" }

function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** Its own full-width section below the board, not a panel squeezed into a
 * column. Results read by brightness rather than by colour. */
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
      if (!gamesResponse.ok || !statsResponse.ok) {
        // The API says exactly what is missing ("set MONGO_URI and JWT_SECRET"),
        // which is more use than a generic "unavailable".
        const detail = await gamesResponse.json().catch(() => null)
        throw new Error(detail?.error ?? "History is unavailable right now.")
      }
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
    <section className="border-t border-rule">
      <div className="mx-auto max-w-[1328px] px-6 py-10 sm:px-14">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <h2 className="wide text-[22px] font-semibold tracking-tight">Your games</h2>
          {stats && stats.finished > 0 && (
            <p className="figures text-[15px] text-graphite">
              <span className="text-chalk">{stats.win} won</span> · {stats.loss} lost ·{" "}
              {stats.draw} drawn
            </p>
          )}
        </div>

        {error && <p className="mt-5 text-[15px] text-alarm">{error}</p>}

        {!error && games.length === 0 && (
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-graphite">
            No games yet. Play one through and it lands here with its result.
          </p>
        )}

        <div className="mt-5">
          {games.map((game) => (
            <div
              key={game.id}
              className="grid grid-cols-[5rem_1fr_auto] items-baseline gap-4 border-t border-rule py-3.5 text-[15px] sm:grid-cols-[7rem_1fr_6rem_5rem]"
            >
              <span className={cn(game.outcome === "win" ? "text-chalk" : "text-graphite")}>
                {game.status === "in_progress"
                  ? "Playing"
                  : (OUTCOME_LABEL[game.outcome ?? ""] ?? "Unfinished")}
              </span>
              <span className="truncate text-graphite">
                {game.opponent ??
                  (game.difficulty ? ENGINES[game.difficulty].opponent : "Unknown")}{" "}
                as {game.playerColor === "w" ? "white" : "black"}
              </span>
              <span className="figures hidden text-graphite sm:block">
                {Math.ceil(game.moves.length / 2)} moves
              </span>
              <span className="text-graphite">{relative(game.startedAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
