"use client"

import { useMemo, useState } from "react"
import { Chess } from "chess.js"

import ChessBoard from "@/components/ChessBoard"
import PlayerRail from "@/components/PlayerRail"
import PromotionDialog from "@/components/PromotionDialog"
import RoomSeats from "@/components/RoomSeats"
import Scoresheet from "@/components/Scoresheet"
import ShareLink from "@/components/ShareLink"
import SiteMark from "@/components/SiteMark"
import { materialBalance, type PieceColor, type PlayedMove } from "@/lib/chess-ui"
import type { Difficulty } from "@/lib/engines"
import { useRoom } from "@/lib/room"
import { cn } from "@/lib/utils"

interface RoomBoardProps {
  roomId: string
  name: string
  role: "play" | "watch"
}

const SIDE = { w: "White", b: "Black" }

export default function RoomBoard({ roomId, name, role }: RoomBoardProps) {
  const { state, connection, error, send } = useRoom(roomId, name, role)
  const [selected, setSelected] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<PieceColor | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)

  // The server sends SAN and the position is rebuilt here, so the board can
  // never disagree with what the server recorded.
  const game = useMemo(() => {
    const replay = new Chess()
    try {
      state?.moves.forEach((san) => replay.move(san))
    } catch {
      // A malformed history would be a server bug; showing the start position
      // beats throwing away the whole page.
    }
    return replay
  }, [state?.moves])

  const header = (
    <header
      className="flex items-center justify-between gap-4 border-b border-line bg-white"
      style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
    >
      <SiteMark />
      <span className="figures text-[13px] text-mute">Room {roomId}</span>
    </header>
  )

  if (!state) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        {header}
        <p className="px-6 py-24 text-center text-[13px] text-mute">
          {connection === "closed" ? (error ?? "Lost contact with the room.") : "Joining the room…"}
        </p>
      </div>
    )
  }

  const yourColor = state.you.color
  const view: PieceColor = orientation ?? yourColor ?? "w"
  const board = game.board()
  const playedMoves = game.history({ verbose: true }) as unknown as PlayedMove[]
  const finished = state.status === "finished"
  const yourTurn = yourColor !== null && state.turn === yourColor && state.status === "playing"

  const captured = { w: [] as string[], b: [] as string[] }
  for (const move of playedMoves) {
    if (move.captured) captured[move.color === "w" ? "b" : "w"].push(move.captured)
  }
  const { advantage, leader } = materialBalance(captured)

  const selectedMoves = selected
    ? game.moves({ square: selected as never, verbose: true })
    : []
  const legalTargets = new Set<string>(selectedMoves.map((m) => m.to))

  const move = (from: string, to: string, promotion?: string) => {
    send({ type: "move", uci: `${from}${to}${promotion ?? ""}` })
    setSelected(null)
  }

  const handleSquareClick = (square: string) => {
    if (!yourTurn) return
    if (selected && legalTargets.has(square)) {
      if (selectedMoves.some((m) => m.to === square && m.promotion)) {
        setPendingPromotion({ from: selected, to: square })
        return
      }
      move(selected, square)
      return
    }
    const piece = game.get(square as never)
    setSelected(piece && piece.color === yourColor ? square : null)
  }

  let checkSquare: string | null = null
  if (game.inCheck()) {
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === state.turn) checkSquare = cell.square
      }
    }
  }

  const opponentSide: PieceColor = view === "w" ? "b" : "w"
  const seatName = (color: PieceColor) => state.seats[color]?.name ?? "Empty seat"
  const seatDetail = (color: PieceColor) =>
    state.seats[color]?.kind === "engine"
      ? `engine · ${color === "w" ? "white" : "black"}`
      : color === "w"
        ? "white"
        : "black"

  let status: string
  if (state.status === "waiting") status = "Waiting for both seats"
  else if (finished && state.termination === "checkmate")
    status = `Checkmate. ${state.result === "1-0" ? "White" : "Black"} wins.`
  else if (finished && state.termination === "resigned")
    status = `${state.result === "1-0" ? "Black" : "White"} resigned.`
  else if (finished) status = "Drawn"
  else if (yourTurn) status = "Your move"
  else status = `${SIDE[state.turn]} to move`

  const quietButton =
    "h-11 rounded-lg border border-field bg-white text-[13px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40 disabled:hover:border-field"

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {header}

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
              MOVE {Math.floor(state.moves.length / 2) + 1}
            </div>
            <h1
              className={cn(
                "font-display text-[40px] font-medium leading-[1.05] tracking-[-0.01em]",
                finished && "text-goldink",
              )}
            >
              {status}
            </h1>
          </div>

          {(connection !== "open" || error) && (
            <div className="rounded-[10px] border border-alarm-line bg-alarm-surface px-4 py-3.5">
              <p className="text-[13px] leading-[1.5] text-alarm [text-wrap:pretty]">
                {connection === "connecting"
                  ? "Connecting…"
                  : connection === "closed"
                    ? "Disconnected. Reload to rejoin."
                    : error}
              </p>
            </div>
          )}

          {yourColor === null && connection === "open" && (
            <p className="text-[13px] text-slate">You are watching this game.</p>
          )}

          <RoomSeats
            state={state}
            onSit={(color) => send({ type: "sit", color })}
            onSeatEngine={(color, difficulty: Difficulty) =>
              send({ type: "engine", color, difficulty })
            }
            onClearSeat={(color) => send({ type: "clearSeat", color })}
          />

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setOrientation(view === "w" ? "b" : "w")}
              className={quietButton}
            >
              Flip board
            </button>
            <button
              type="button"
              onClick={() => send({ type: "resign" })}
              disabled={yourColor === null || finished || state.moves.length === 0}
              className={quietButton}
            >
              Resign
            </button>
            <button
              type="button"
              onClick={() => send({ type: "newGame" })}
              disabled={yourColor === null || (!finished && state.moves.length > 0)}
              className="h-11 rounded-lg bg-ink text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b] disabled:opacity-40"
            >
              NEW GAME
            </button>
          </div>

          <ShareLink roomId={roomId} />
        </aside>

        <section
          className="flex min-w-0 flex-[1_1_420px] flex-col gap-3"
          style={{ maxWidth: "min(640px, calc(100vh - 16rem))" }}
        >
          <PlayerRail
            name={seatName(opponentSide)}
            color={opponentSide}
            detail={seatDetail(opponentSide)}
            initial={seatName(opponentSide).charAt(0).toUpperCase()}
            variant="opponent"
            captured={captured[view]}
            capturedColor={view}
            advantage={leader === opponentSide ? advantage : 0}
            active={state.turn === opponentSide && !finished}
          />

          <ChessBoard
            board={board}
            orientation={view}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={null}
            checkSquare={checkSquare}
            interactive={yourTurn}
            onSquareClick={handleSquareClick}
          />

          <PlayerRail
            name={seatName(view)}
            color={view}
            detail={seatDetail(view)}
            initial={seatName(view).charAt(0).toUpperCase()}
            variant="you"
            captured={captured[opponentSide]}
            capturedColor={opponentSide}
            advantage={leader === view ? advantage : 0}
            active={state.turn === view && !finished}
          />
        </section>

        <aside
          className="sticky top-6 flex flex-[0_0_260px] flex-col self-stretch overflow-auto rounded-xl border border-line bg-white p-[18px]"
          style={{ maxHeight: "calc(100vh - 140px)" }}
        >
          <Scoresheet moves={playedMoves} result={finished ? state.result : null} />
        </aside>
      </main>

      {pendingPromotion && yourColor && (
        <PromotionDialog
          color={yourColor}
          onSelect={(piece) => {
            const { from, to } = pendingPromotion
            setPendingPromotion(null)
            move(from, to, piece)
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  )
}
