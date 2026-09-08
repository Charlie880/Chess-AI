"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Chess, type Move } from "chess.js"

import ChessBoard from "@/components/ChessBoard"
import CapturedPieces from "@/components/CapturedPieces"
import ModeSelector, { type Difficulty } from "@/components/ModeSelector"
import MoveLog from "@/components/MoveLog"
import PromotionDialog from "@/components/PromotionDialog"
import { materialBalance, type PieceColor } from "@/lib/chess-ui"

type Captured = { w: string[]; b: string[] }

export default function ChessGame() {
  // chess.js is mutable, so it lives in a ref and `version` drives re-renders.
  // Keeping it in state instead means every async engine reply races a stale
  // closure over the previous position.
  const game = useRef(new Chess())
  const [version, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)

  const [difficulty, setDifficulty] = useState<Difficulty>("normal")
  const [playerColor, setPlayerColor] = useState<PieceColor>("w")
  const [orientation, setOrientation] = useState<PieceColor>("w")
  const [selected, setSelected] = useState<string | null>(null)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  const [captured, setCaptured] = useState<Captured>({ w: [], b: [] })
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)

  const board = game.current.board()
  const turn = game.current.turn()
  const history = game.current.history()
  const isPlayerTurn = turn === playerColor && !thinking && !game.current.isGameOver()

  const recordCapture = (move: Move) => {
    if (!move.captured) return
    // The captured piece belonged to the side that did not move.
    const victim: PieceColor = move.color === "w" ? "b" : "w"
    setCaptured((prev) => ({ ...prev, [victim]: [...prev[victim], move.captured as string] }))
  }

  const requestEngineMove = useCallback(async () => {
    if (game.current.isGameOver()) return
    setThinking(true)
    setError(null)
    try {
      const response = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: game.current.fen(), difficulty }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Engine request failed")

      // Always move by from/to: a UCI string is not SAN, and chess.js rejects it.
      const move = game.current.move({
        from: data.from,
        to: data.to,
        promotion: data.promotion ?? undefined,
      })
      recordCapture(move)
      setLastMove({ from: move.from, to: move.to })
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Engine unavailable")
    } finally {
      setThinking(false)
    }
  }, [difficulty])

  const playMove = (from: string, to: string, promotion?: string) => {
    let move: Move
    try {
      move = game.current.move({ from, to, promotion })
    } catch {
      return false
    }
    recordCapture(move)
    setLastMove({ from: move.from, to: move.to })
    setSelected(null)
    bump()
    void requestEngineMove()
    return true
  }

  const selectedMoves = selected
    ? game.current.moves({ square: selected as never, verbose: true })
    : []
  const legalTargets = new Set<string>(selectedMoves.map((m) => m.to))

  const handleSquareClick = (square: string) => {
    if (!isPlayerTurn) return

    if (selected && legalTargets.has(square)) {
      if (selectedMoves.some((m) => m.to === square && m.promotion)) {
        setPendingPromotion({ from: selected, to: square })
        return
      }
      playMove(selected, square)
      return
    }

    const piece = game.current.get(square as never)
    setSelected(piece && piece.color === playerColor ? square : null)
  }

  const newGame = (color: PieceColor) => {
    game.current = new Chess()
    setPlayerColor(color)
    setOrientation(color)
    setSelected(null)
    setLastMove(null)
    setCaptured({ w: [], b: [] })
    setPendingPromotion(null)
    setError(null)
    bump()
    if (color === "b") void requestEngineMove()
  }

  // King square, so the board can light up the checked king.
  let checkSquare: string | null = null
  if (game.current.inCheck()) {
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === turn) checkSquare = cell.square
      }
    }
  }

  const { advantage, leader } = materialBalance(captured)
  const opponentColor: PieceColor = playerColor === "w" ? "b" : "w"

  let status = `${turn === "w" ? "White" : "Black"} to move`
  let result: string | null = null
  if (game.current.isCheckmate()) {
    status = `Checkmate - ${turn === "w" ? "Black" : "White"} wins`
    result = turn === "w" ? "0-1" : "1-0"
  } else if (game.current.isStalemate()) {
    status = "Stalemate"
    result = "1/2-1/2"
  } else if (game.current.isDraw()) {
    status = "Draw"
    result = "1/2-1/2"
  } else if (game.current.inCheck()) {
    status = `${turn === "w" ? "White" : "Black"} is in check`
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f") setOrientation((o) => (o === "w" ? "b" : "w"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <main className="min-h-screen bg-neutral-950 p-4 text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
        <section className="flex flex-col items-center gap-2">
          <CapturedPieces
            label={opponentColor === "w" ? "White" : "Black"}
            captured={captured[playerColor]}
            color={playerColor}
            advantage={leader === opponentColor ? advantage : 0}
            thinking={thinking}
          />

          <ChessBoard
            board={board}
            orientation={orientation}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            interactive={isPlayerTurn}
            onSquareClick={handleSquareClick}
          />

          <CapturedPieces
            label={playerColor === "w" ? "White" : "Black"}
            captured={captured[opponentColor]}
            color={opponentColor}
            advantage={leader === playerColor ? advantage : 0}
          />
        </section>

        <aside className="flex w-full flex-col gap-3 lg:w-72">
          <div className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-3">
            <p className="text-lg font-semibold">{status}</p>
            {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
          </div>

          <ModeSelector difficulty={difficulty} onDifficultyChange={setDifficulty} disabled={thinking} />

          <MoveLog moves={history} result={result} />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => newGame("w")}
              disabled={thinking}
              className="rounded border border-neutral-700 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-40"
            >
              New game (white)
            </button>
            <button
              type="button"
              onClick={() => newGame("b")}
              disabled={thinking}
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-40"
            >
              New game (black)
            </button>
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              className="col-span-2 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Flip board <span className="text-neutral-500">(f)</span>
            </button>
          </div>
        </aside>
      </div>

      {pendingPromotion && (
        <PromotionDialog
          color={playerColor}
          onSelect={(piece) => {
            const { from, to } = pendingPromotion
            setPendingPromotion(null)
            playMove(from, to, piece)
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </main>
  )
}
