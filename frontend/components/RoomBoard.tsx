"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Chess } from "chess.js"

import ChessBoard from "@/components/ChessBoard"
import PlayerRail from "@/components/PlayerRail"
import PromotionDialog from "@/components/PromotionDialog"
import RoomSeats from "@/components/RoomSeats"
import Scoresheet from "@/components/Scoresheet"
import ShareLink from "@/components/ShareLink"
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

  const boardWidth = { width: "min(92vw, calc(100vh - 13.5rem))", maxWidth: "100%" }

  const header = (
    <header className="flex items-center justify-between gap-4 border-b border-rule px-6 py-3 sm:px-14">
      <Link href="/" className="wide text-base font-semibold tracking-tight hover:text-brass">
        Chess AI
      </Link>
      <span className="figures text-sm text-graphite">Room {roomId}</span>
    </header>
  )

  if (!state) {
    return (
      <div className="min-h-screen">
        {header}
        <p className="px-6 py-24 text-center text-[15px] text-graphite">
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
    state.seats[color]?.kind === "engine" ? "engine" : yourColor === color ? "you" : undefined

  let status: string
  if (state.status === "waiting") status = "Waiting for both seats"
  else if (finished && state.termination === "checkmate")
    status = `Checkmate. ${state.result === "1-0" ? "White" : "Black"} wins.`
  else if (finished && state.termination === "resigned")
    status = `${state.result === "1-0" ? "Black" : "White"} resigned.`
  else if (finished) status = "Drawn."
  else if (yourTurn) status = "Your move"
  else status = `${SIDE[state.turn]} to move`

  const quiet =
    "text-left text-[15px] text-graphite transition-colors hover:text-chalk disabled:opacity-40 disabled:hover:text-graphite"

  return (
    <div className="min-h-screen">
      {header}

      <main className="mx-auto grid max-w-[1328px] justify-center gap-x-10 gap-y-8 px-6 py-7 sm:px-10 lg:grid-cols-[minmax(0,17.5rem)_auto_minmax(0,17.5rem)] xl:gap-x-14 lg:items-start">
        <div className="order-2 lg:order-1 lg:pt-12">
          <p
            className={cn(
              "wide text-[30px] font-semibold leading-tight tracking-tight",
              finished && "text-brass",
            )}
          >
            {status}
          </p>

          {connection !== "open" && (
            <p className="mt-3 text-[15px] text-alarm">
              {connection === "connecting" ? "Connecting…" : "Disconnected. Reload to rejoin."}
            </p>
          )}
          {error && connection === "open" && <p className="mt-3 text-[15px] text-alarm">{error}</p>}
          {yourColor === null && connection === "open" && (
            <p className="mt-3 text-[15px] text-graphite">You are watching this game.</p>
          )}

          <div className="mt-8">
            <RoomSeats
              state={state}
              onSit={(color) => send({ type: "sit", color })}
              onSeatEngine={(color, difficulty: Difficulty) =>
                send({ type: "engine", color, difficulty })
              }
              onClearSeat={(color) => send({ type: "clearSeat", color })}
            />
          </div>

          <div className="mt-7 flex flex-col items-start gap-3.5">
            <button
              type="button"
              onClick={() => send({ type: "newGame" })}
              disabled={yourColor === null || (!finished && state.moves.length > 0)}
              className="text-left text-[15px] font-semibold text-brass transition-colors hover:text-[#E6B75C] disabled:opacity-40"
            >
              New game
            </button>
            <button
              type="button"
              onClick={() => send({ type: "resign" })}
              disabled={yourColor === null || finished || state.moves.length === 0}
              className={quiet}
            >
              Resign
            </button>
            <button
              type="button"
              onClick={() => setOrientation(view === "w" ? "b" : "w")}
              className={quiet}
            >
              Flip board
            </button>
          </div>
        </div>

        <section className="order-1 flex flex-col items-center lg:order-2">
          <div style={boardWidth}>
            <PlayerRail
              name={seatName(opponentSide)}
              color={opponentSide}
              detail={seatDetail(opponentSide)}
              captured={captured[view]}
              capturedColor={view}
              advantage={leader === opponentSide ? advantage : 0}
              active={state.turn === opponentSide && !finished}
              edge="top"
            />
          </div>

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

          <div style={boardWidth}>
            <PlayerRail
              name={seatName(view)}
              color={view}
              detail={seatDetail(view)}
              captured={captured[opponentSide]}
              capturedColor={opponentSide}
              advantage={leader === view ? advantage : 0}
              active={state.turn === view && !finished}
              edge="bottom"
            />
          </div>
        </section>

        <div className="order-3 lg:pt-12">
          <Scoresheet moves={playedMoves} result={finished ? state.result : null} />
          <ShareLink roomId={roomId} />
        </div>
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
