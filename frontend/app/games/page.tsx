"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import SiteMark from "@/components/SiteMark"

type Entry = {
  id: string
  whiteName: string | null
  blackName: string | null
  moves: string[]
  result: string | null
  termination: string | null
  finishedAt: string | null
}

/** Open to guests: finished games between two people, each replayable with the
 * conversation that went with it. */
export default function GamesPage() {
  const [games, setGames] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/games/public")
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error ?? "Games are unavailable right now.")
        return data as Entry[]
      })
      .then(setGames)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="flex items-center justify-between border-b border-line bg-white"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />
        <Link href="/play" className="text-[13px] font-semibold text-ink hover:text-goldink">
          Play
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[860px] flex-1 px-4 py-12">
        <p className="text-[11px] font-bold tracking-[0.16em] text-mute">PLAYED GAMES</p>
        <h1 className="mt-2 font-display text-[40px] font-medium leading-[1.05] tracking-[-0.01em]">
          Choose a game to replay
        </h1>

        {error && <p className="mt-6 text-[13px] text-alarm">{error}</p>}
        {games && games.length === 0 && (
          <p className="mt-6 text-[13px] text-mute">
            No finished games yet. Games between two people appear here once they end.
          </p>
        )}

        <div className="mt-8 rounded-xl border border-line bg-white">
          {games?.map((game, i) => (
            <Link
              key={game.id}
              href={`/games/${game.id}`}
              className={`grid grid-cols-[1fr_auto] items-baseline gap-4 px-5 py-4 text-[14px] transition-colors hover:bg-goldwash sm:grid-cols-[1fr_5rem_8rem] ${i > 0 ? "border-t border-divider" : ""}`}
            >
              <span className="font-semibold">
                {game.whiteName ?? "White"} <span className="font-normal text-mute">vs</span>{" "}
                {game.blackName ?? "Black"}
              </span>
              <span className="figures font-bold text-goldink">{game.result}</span>
              <span className="hidden text-[13px] capitalize text-mute sm:block">
                {Math.ceil(game.moves.length / 2)} moves · {game.termination}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
