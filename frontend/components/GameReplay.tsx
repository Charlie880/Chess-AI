"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Chess } from "chess.js"

import ChessBoard from "@/components/ChessBoard"
import PlayerRail from "@/components/PlayerRail"
import Scoresheet from "@/components/Scoresheet"
import SiteMark from "@/components/SiteMark"
import { materialBalance, type PieceColor, type PlayedMove } from "@/lib/chess-ui"
import { cn } from "@/lib/utils"

export type ReplayChat = { id: string; ownerId: string | null; name: string; text: string; at: string }

export type ReplayGame = {
  id: string
  moves: string[]
  moveTimes: string[]
  chat: ReplayChat[]
  playerColor: PieceColor
  opponent: string
  whiteName: string | null
  blackName: string | null
  result: string | null
  termination: string | null
}

const STEP_MS = 1200

/** Chat is shown as it was said: a message appears once the move that followed
 * it is next up, so playing forward re-creates the conversation in order.
 * Games with no move timestamps (engine games) have nothing to sync, so they
 * show everything. */
function visibleChat(chat: ReplayChat[], moveTimes: string[], step: number): ReplayChat[] {
  if (step >= moveTimes.length) return chat
  const cutoff = Date.parse(moveTimes[step])
  return chat.filter((message) => Date.parse(message.at) < cutoff)
}

export default function GameReplay({ game }: { game: ReplayGame }) {
  const total = game.moves.length
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [orientation, setOrientation] = useState<PieceColor>(game.playerColor)

  const position = useMemo(() => {
    const chess = new Chess()
    for (let i = 0; i < step; i++) chess.move(game.moves[i])
    return chess
  }, [game.moves, step])

  useEffect(() => {
    if (!playing) return
    if (step >= total) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS)
    return () => clearTimeout(timer)
  }, [playing, step, total])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(total, s + 1))
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [total])

  const go = (to: number) => {
    setPlaying(false)
    setStep(Math.max(0, Math.min(total, to)))
  }

  const chat = visibleChat(game.chat, game.moveTimes, step)
  const board = position.board()
  const turn = position.turn()
  const atEnd = step === total
  const played = position.history({ verbose: true }) as unknown as PlayedMove[]
  const lastMove = played.length ? played[played.length - 1] : null

  let checkSquare: string | null = null
  if (position.inCheck()) {
    for (const row of board)
      for (const cell of row)
        if (cell && cell.type === "k" && cell.color === turn) checkSquare = cell.square
  }

  const captured: { w: string[]; b: string[] } = { w: [], b: [] }
  for (const move of played) {
    if (move.captured) captured[move.color === "w" ? "b" : "w"].push(move.captured)
  }
  const { advantage, leader } = materialBalance(captured)

  const nameOf = (color: PieceColor) =>
    (color === "w" ? game.whiteName : game.blackName) ??
    (color === game.playerColor ? "You" : game.opponent)
  const bottom: PieceColor = orientation
  const top: PieceColor = orientation === "w" ? "b" : "w"

  const button =
    "h-10 flex-1 rounded-lg border border-field bg-white text-[12px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40 disabled:hover:border-field"

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="flex items-center justify-between border-b border-line bg-white"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />
        <span className="text-[11px] font-bold tracking-[0.16em] text-mute">REPLAY</span>
        <Link
          href="/games"
          className="flex h-10 items-center rounded-lg border border-field bg-white px-4 text-xs font-semibold text-ink transition-colors hover:border-ink"
        >
          All games
        </Link>
      </header>

      <main
        className="flex flex-1 flex-wrap items-start justify-center"
        style={{
          gap: "clamp(24px, 3vw, 48px)",
          padding: "clamp(24px, 4vw, 48px) clamp(16px, 3vw, 40px)",
        }}
      >
        <aside className="flex max-w-[300px] flex-[1_1_240px] flex-col gap-5">
          <div>
            <div className="mb-2 text-[11px] font-bold tracking-[0.16em] text-mute">
              MOVE {step} OF {total}
            </div>
            <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-[-0.01em]">
              {atEnd
                ? (game.result ?? "Finished")
                : `${turn === "w" ? "White" : "Black"} to move`}
            </h1>
            {atEnd && game.termination && (
              <p className="mt-2 text-[13px] capitalize text-slate">{game.termination}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => go(0)} disabled={step === 0} className={button} aria-label="Go to start">
                Start
              </button>
              <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className={button} aria-label="Previous move">
                Back
              </button>
              <button type="button" onClick={() => go(step + 1)} disabled={atEnd} className={button} aria-label="Next move">
                Next
              </button>
              <button type="button" onClick={() => go(total)} disabled={atEnd} className={button} aria-label="Go to end">
                End
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (atEnd) setStep(0)
                setPlaying((p) => !p)
              }}
              className="h-11 rounded-lg bg-ink text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b]"
            >
              {playing ? "PAUSE" : atEnd ? "REPLAY FROM START" : "PLAY"}
            </button>
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              className={cn(button, "h-11 flex-none text-[13px]")}
            >
              Flip board
            </button>
            <p className="text-xs text-mute">Left and right arrow keys step through the game.</p>
          </div>
        </aside>

        <section
          className="flex min-w-0 flex-[1_1_420px] flex-col gap-3"
          style={{ maxWidth: "min(640px, calc(100vh - 16rem))" }}
        >
          <PlayerRail
            name={nameOf(top)}
            color={top}
            detail={top === "w" ? "white" : "black"}
            initial={nameOf(top).charAt(0).toUpperCase()}
            variant="opponent"
            captured={captured[bottom]}
            capturedColor={bottom}
            advantage={leader === top ? advantage : 0}
            active={false}
          />
          <ChessBoard
            board={board}
            orientation={orientation}
            selected={null}
            legalTargets={new Set()}
            lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
            checkSquare={checkSquare}
            interactive={false}
            onSquareClick={() => {}}
          />
          <PlayerRail
            name={nameOf(bottom)}
            color={bottom}
            detail={bottom === "w" ? "white" : "black"}
            initial={nameOf(bottom).charAt(0).toUpperCase()}
            variant="you"
            captured={captured[top]}
            capturedColor={top}
            advantage={leader === bottom ? advantage : 0}
            active={false}
          />
        </section>

        <aside
          className="sticky top-6 flex flex-[0_0_280px] flex-col gap-4 self-stretch"
          style={{ maxHeight: "calc(100vh - 140px)" }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-xl border border-line bg-white p-[18px]">
            <Scoresheet moves={played} result={atEnd ? game.result : null} />
          </div>

          <div className="rounded-xl border border-line bg-white">
            <div className="border-b border-divider px-[18px] py-3">
              <span className="text-[11px] font-bold tracking-[0.16em] text-mute">CHAT</span>
            </div>
            <div
              className="flex max-h-56 min-h-[6rem] flex-col gap-2 overflow-y-auto px-[18px] py-3"
              data-testid="replay-chat"
            >
              {chat.length === 0 ? (
                <p className="text-[13px] text-mute">
                  {game.chat.length === 0 ? "Nobody said anything in this game." : "Nothing said yet."}
                </p>
              ) : (
                chat.map((message) => (
                  <p key={message.id} className="text-[13px] leading-[1.5]">
                    <span className="font-bold text-ink">{message.name}</span>{" "}
                    <span className="text-slate">{message.text}</span>
                  </p>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
