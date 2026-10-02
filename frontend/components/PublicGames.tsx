"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

type Entry = {
  id: string
  whiteName: string | null
  blackName: string | null
  moves: string[]
  result: string | null
  termination: string | null
}

/** Finished games between two people, open to everyone including guests. */
export default function PublicGames({ limit }: { limit?: number }) {
  const [games, setGames] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    setGames(null)
    fetch("/api/games/public")
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok || !Array.isArray(data)) throw new Error(data?.error ?? "Games are unavailable right now.")
        return data as Entry[]
      })
      .then(setGames)
      .catch((err: Error) => setError(err.message || "Games are unavailable right now."))
  }, [])

  useEffect(load, [load])

  if (error) {
    return (
      <div className="rounded-xl border border-alarm-line bg-alarm-surface px-5 py-4">
        <p className="text-[13px] text-alarm">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 text-[13px] font-bold text-ink underline decoration-gold underline-offset-4"
        >
          Try again
        </button>
      </div>
    )
  }

  if (games === null) {
    return (
      <div className="rounded-xl border border-line bg-white" aria-busy="true" aria-label="Loading games">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`px-5 py-4 ${i > 0 ? "border-t border-divider" : ""}`}>
            <div className="h-4 w-2/3 animate-pulse rounded bg-chip" />
          </div>
        ))}
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white px-5 py-4 text-[13px] leading-[1.5] text-mute">
        No finished games yet. When two people finish a game it appears here, with its chat.
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-white">
      {games.slice(0, limit).map((game, i) => (
        <Link
          key={game.id}
          href={`/games/${game.id}`}
          className={`grid grid-cols-[1fr_auto] items-baseline gap-4 px-5 py-3.5 text-[14px] transition-colors hover:bg-goldwash ${i > 0 ? "border-t border-divider" : ""}`}
        >
          <span className="truncate font-semibold">
            {game.whiteName ?? "White"} <span className="font-normal text-mute">vs</span>{" "}
            {game.blackName ?? "Black"}
            <span className="ml-2 text-[12px] font-normal capitalize text-mute">
              {Math.ceil(game.moves.length / 2)} moves · {game.termination}
            </span>
          </span>
          <span className="figures font-bold text-goldink">{game.result}</span>
        </Link>
      ))}
    </div>
  )
}
