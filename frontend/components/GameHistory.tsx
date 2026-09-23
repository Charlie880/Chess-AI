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

/** Not in the design, which only covers the game itself - this keeps the
 * history feature, dressed in the same palette, below the board. */
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
    <section
      className="border-t border-line bg-white"
      style={{ padding: "clamp(28px, 4vw, 44px) clamp(16px, 3vw, 40px)" }}
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h2 className="font-display text-[22px] font-medium tracking-[-0.01em]">Your games</h2>
          {stats && stats.finished > 0 && (
            <p className="figures text-[13px] text-mute">
              <span className="font-bold text-goldink">{stats.win} won</span> · {stats.loss} lost ·{" "}
              {stats.draw} drawn
            </p>
          )}
        </div>

        {error && <p className="mt-4 text-[13px] text-alarm">{error}</p>}

        {!error && games.length === 0 && (
          <p className="mt-4 max-w-md text-[13px] leading-[1.5] text-mute">
            No games yet. Play one through and it lands here with its result.
          </p>
        )}

        <div className="mt-4">
          {games.map((game) => (
            <div
              key={game.id}
              className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-4 border-t border-divider py-3 text-[13px] sm:grid-cols-[6rem_1fr_6rem_5rem]"
            >
              <span
                className={cn(
                  "font-semibold",
                  game.outcome === "win" ? "text-goldink" : "text-slate",
                )}
              >
                {game.status === "in_progress"
                  ? "Playing"
                  : (OUTCOME_LABEL[game.outcome ?? ""] ?? "Unfinished")}
              </span>
              <span className="truncate text-slate">
                {game.opponent ??
                  (game.difficulty ? ENGINES[game.difficulty].opponent : "Unknown")}{" "}
                as {game.playerColor === "w" ? "white" : "black"}
              </span>
              <span className="figures hidden text-mute sm:block">
                {Math.ceil(game.moves.length / 2)} moves
              </span>
              <span className="text-mute">{relative(game.startedAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
