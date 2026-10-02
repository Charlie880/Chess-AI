"use client"

import BackLink from "@/components/BackLink"
import PublicGames from "@/components/PublicGames"
import SiteMark from "@/components/SiteMark"

export default function GamesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="flex items-center justify-between border-b border-line bg-white"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />
        <BackLink href="/play">Back to play</BackLink>
      </header>

      <main className="mx-auto w-full max-w-[860px] flex-1 px-4 py-12">
        <p className="text-[11px] font-bold tracking-[0.16em] text-mute">PLAYED GAMES</p>
        <h1 className="mb-8 mt-2 font-display text-[40px] font-medium leading-[1.05] tracking-[-0.01em]">
          Choose a game to replay
        </h1>
        <PublicGames />
      </main>
    </div>
  )
}
