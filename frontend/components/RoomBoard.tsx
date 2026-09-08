"use client"

import { useMemo, useState } from "react"
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

  if (!state) {
    return (
      <p className="px-4 py-8 text-center text-graphite">
        {connection === "closed" ? (error ?? "Lost contact with the room.") : "Joining the room…"}
      </p>
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

  let status: string
  if (state.status === "waiting") status = "Waiting for both seats to be filled"
  else if (finished && state.termination === "checkmate")
    status = `Checkmate. ${state.result === "1-0" ? "White" : "Black"} wins.`
  else if (finished && state.termination === "resigned")
    status = `${state.result === "1-0" ? "Black" : "White"} resigned.`
  else if (finished) status = "Drawn."
  else if (yourTurn) status = "Your move"
  else status = `${SIDE[state.turn]} to move`

  const quiet =
    "border border-rule px-3 py-2 text-[15px] text-graphite transition-colors hover:border-graphite hover:text-chalk disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-graphite"

  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-4 lg:flex-row lg:items-start lg:justify-center">
      <section className="flex w-full flex-col items-center lg:w-auto">
        <div style={{ width: "min(92vw, calc(100vh - 13rem))", maxWidth: "100%" }}>
          <PlayerRail
            name={seatName(opponentSide)}
            color={opponentSide}
            detail={state.seats[opponentSide]?.kind === "engine" ? "engine" : undefined}
            captured={captured[view]}
            capturedColor={view}
            advantage={leader === opponentSide ? advantage : 0}
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

        <div style={{ width: "min(92vw, calc(100vh - 13rem))", maxWidth: "100%" }}>
          <PlayerRail
            name={seatName(view)}
            color={view}
            detail={yourColor === view ? "you" : state.seats[view]?.kind === "engine" ? "engine" : undefined}
            captured={captured[opponentSide]}
            capturedColor={opponentSide}
            advantage={leader === view ? advantage : 0}
          />
        </div>
      </section>

      <aside className="w-full divide-y divide-rule border border-rule bg-slate lg:w-[23rem]">
        <div className="px-4 py-4">
          <p className={cn("wide text-2xl font-semibold leading-tight tracking-tight", finished && "text-brass")}>
            {status}
          </p>
          {connection !== "open" && (
            <p className="mt-1.5 text-sm text-alarm">
              {connection === "connecting" ? "Connecting…" : "Disconnected. Reload to rejoin."}
            </p>
          )}
          {error && connection === "open" && <p className="mt-1.5 text-sm text-alarm">{error}</p>}
          {yourColor === null && connection === "open" && (
            <p className="mt-1.5 text-sm text-graphite">You are watching this game.</p>
          )}
        </div>

        <RoomSeats
          state={state}
          onSit={(color) => send({ type: "sit", color })}
          onSeatEngine={(color, difficulty: Difficulty) =>
            send({ type: "engine", color, difficulty })
          }
          onClearSeat={(color) => send({ type: "clearSeat", color })}
        />

        <Scoresheet moves={playedMoves} result={finished ? state.result : null} />

        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => send({ type: "newGame" })}
            disabled={yourColor === null || (!finished && state.moves.length > 0)}
            className="bg-brass px-3 py-2 text-[15px] font-semibold text-ink hover:bg-[#D9A64C] disabled:opacity-40"
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
            className={cn(quiet, "col-span-2")}
          >
            Flip board
          </button>
        </div>

        <ShareLink roomId={roomId} />
      </aside>

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
    </main>
  )
}
