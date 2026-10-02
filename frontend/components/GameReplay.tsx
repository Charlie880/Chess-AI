"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Chess } from "chess.js"
import ChessBoard from "@/components/ChessBoard"
import PlayerRail from "@/components/PlayerRail"
import Scoresheet from "@/components/Scoresheet"
import RoomChat from "@/components/RoomChat"
import { materialBalance, type PieceColor, type PlayedMove } from "@/lib/chess-ui"
import { ENGINES, type Difficulty } from "@/lib/engines"
import SiteMark from "@/components/SiteMark"
import { cn } from "@/lib/utils"
import Link from "next/link"

type ChatMessage = { id: string; ownerId: string | null; name: string; text: string; at: string }

interface GameReplayProps {
  gameId: string
  moves: string[]
  playerColor: "w" | "b"
  difficulty: Difficulty | null
  opponent: string
  result: string | null
  termination: string | null
}

export default function GameReplay({
  gameId,
  moves,
  playerColor,
  difficulty,
  opponent,
  result,
  termination,
}: GameReplayProps) {
  const game = useRef(new Chess())
  const [currentMove, setCurrentMove] = useState(0)
  const [orientation, setOrientation] = useState<PieceColor>("w")
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [loadingChat, setLoadingChat] = useState(false)

  useEffect(() => {
    setLoadingChat(true)
    fetch(`/api/games/${gameId}/chat`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setChat)
      .catch(() => setChat([]))
      .finally(() => setLoadingChat(false))
  }, [gameId])

  const board = game.current.board()
  const opponentColor: PieceColor = playerColor === "w" ? "b" : "w"

  // Replay moves up to currentMove
  const replayGame = useCallback((toMove: number) => {
    game.current = new Chess()
    for (let i = 0; i < toMove && i < moves.length; i++) {
      game.current.move(moves[i])
    }
    setCurrentMove(toMove)
  }, [moves])

  const playedMoves = game.current.history({ verbose: true }) as unknown as PlayedMove[]
  const turn = game.current.turn()
  const finished = currentMove === moves.length

  let checkSquare: string | null = null
  if (game.current.inCheck()) {
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === turn) checkSquare = cell.square
      }
    }
  }

  const movePairs = moves.length > 0 ? Math.ceil(moves.length / 2) : 0
  const currentMoveNumber = Math.floor(currentMove / 2) + 1

  // Filter chat to only messages sent before or at the current move timestamp
  const visibleChat = chat

  const engine = difficulty ? ENGINES[difficulty] : { opponent, detail: "multiplayer opponent", label: opponent }

  const opponentDetail =
    difficulty || opponent.startsWith("Guest")
      ? `engine · ${opponentColor === "w" ? "white" : "black"}`
      : `player · ${opponentColor === "w" ? "white" : "black"}`

  // Captured pieces up to current position
  const captured = { w: [] as string[], b: [] as string[] }
  for (const move of playedMoves) {
    if (move.captured) {
      const victim: PieceColor = move.color === "w" ? "b" : "w"
      captured[victim].push(move.captured)
    }
  }
  const { advantage, leader } = materialBalance(captured)

  const quietButton =
    "h-10 rounded-lg border border-field bg-white text-[12px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40"

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line bg-white lg:grid lg:grid-cols-[1fr_auto_1fr]"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />

        <div className="order-last flex w-full justify-center lg:order-none lg:w-auto">
          <span className="text-[13px] font-bold text-ink">Replay</span>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/play/computer"
            className="h-10 rounded-lg border border-field bg-white px-4 text-xs font-semibold text-ink transition-colors hover:border-ink"
          >
            Back
          </Link>
        </div>
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
            <div className="mb-2 text-[11px] font-bold tracking-[0.16em] text-mute">MOVE {currentMoveNumber}</div>
            <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-[-0.01em]">
              {finished ? `Result: ${result || "Draw"}` : `${turn === "w" ? "White" : "Black"} to move`}
            </h1>
            {termination && <p className="mt-2 text-[13px] text-slate capitalize">{termination}</p>}
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-[18px]">
            <div>
              <div className="text-[15px] font-bold">{engine.opponent}</div>
              <div className="mt-1 text-[13px] leading-[1.5] text-slate">{engine.detail}</div>
            </div>

            <div className="h-px bg-divider" />

            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-slate">Orientation</span>
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
                className="text-[12px] font-bold text-goldink hover:text-ink"
              >
                {orientation === "w" ? "White" : "Black"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => replayGame(0)}
              disabled={currentMove === 0}
              className={cn(quietButton, "text-[11px]")}
            >
              ⏮ Start
            </button>
            <button
              type="button"
              onClick={() => replayGame(Math.max(0, currentMove - 1))}
              disabled={currentMove === 0}
              className={cn(quietButton, "text-[11px]")}
            >
              ⏪ Previous
            </button>
            <button
              type="button"
              onClick={() => replayGame(Math.min(moves.length, currentMove + 1))}
              disabled={finished}
              className={cn(quietButton, "text-[11px]")}
            >
              ⏩ Next
            </button>
            <button
              type="button"
              onClick={() => replayGame(moves.length)}
              disabled={finished}
              className={cn(quietButton, "text-[11px]")}
            >
              ⏭ End
            </button>
          </div>

          <div className="rounded-xl border border-line bg-white p-[18px]">
            <div className="text-[11px] font-bold tracking-[0.16em] text-mute mb-2">PROGRESS</div>
            <div className="h-2 bg-field rounded-full overflow-hidden">
              <div
                className="h-full bg-gold transition-all duration-200"
                style={{ width: `${(currentMove / moves.length) * 100}%` }}
              />
            </div>
            <div className="mt-2 text-[12px] text-slate">
              Move {currentMove} of {moves.length}
            </div>
          </div>
        </aside>

        <section
          className="flex min-w-0 flex-[1_1_420px] flex-col gap-3"
          style={{ maxWidth: "min(640px, calc(100vh - 16rem))" }}
        >
          <PlayerRail
            name={engine.opponent}
            color={opponentColor}
            detail={opponentDetail}
            initial={engine.opponent.charAt(0)}
            variant="opponent"
            captured={captured[playerColor]}
            capturedColor={playerColor}
            advantage={leader === opponentColor ? advantage : 0}
            active={false}
          />

          <ChessBoard
            board={board}
            orientation={orientation}
            selected={null}
            legalTargets={new Set()}
            lastMove={null}
            checkSquare={checkSquare}
            interactive={false}
            onSquareClick={() => {}}
          />

          <PlayerRail
            name="You"
            color={playerColor}
            detail={playerColor === "w" ? "white" : "black"}
            initial="Y"
            variant="you"
            captured={captured[opponentColor]}
            capturedColor={opponentColor}
            advantage={leader === playerColor ? advantage : 0}
            active={false}
          />
        </section>

        <aside
          className="sticky top-6 flex flex-[0_0_280px] flex-col self-stretch gap-3 overflow-hidden rounded-xl border border-line bg-white"
          style={{ maxHeight: "calc(100vh - 140px)" }}
        >
          <div className="border-b border-divider px-[18px] py-3 flex-shrink-0">
            <span className="text-[11px] font-bold tracking-[0.16em] text-mute">MOVES</span>
          </div>
          <div className="px-[18px] py-3 flex-1 min-h-0">
            <div className="overflow-y-auto h-full">
              <Scoresheet moves={playedMoves} result={result} />
            </div>
          </div>

          <div className="border-t border-divider flex-shrink-0">
            <div className="border-b border-divider px-[18px] py-3">
              <span className="text-[11px] font-bold tracking-[0.16em] text-mute">CHAT</span>
            </div>

            <div className="flex max-h-40 min-h-[4rem] flex-col gap-2 overflow-y-auto px-[18px] py-3">
              {loadingChat ? (
                <p className="text-[12px] text-mute">Loading chat...</p>
              ) : visibleChat.length === 0 ? (
                <p className="text-[12px] text-mute">No messages.</p>
              ) : (
                visibleChat.map((message) => (
                  <p key={message.id} className="text-[12px] leading-[1.4]">
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
