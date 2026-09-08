"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Chess, type Move } from "chess.js"

import AuthPanel, { type User } from "@/components/AuthPanel"
import ChessBoard from "@/components/ChessBoard"
import EngineSelector from "@/components/EngineSelector"
import GameHistory from "@/components/GameHistory"
import PlayerRail from "@/components/PlayerRail"
import PromotionDialog from "@/components/PromotionDialog"
import Scoresheet from "@/components/Scoresheet"
import { materialBalance, type PieceColor } from "@/lib/chess-ui"
import { ENGINES, type Difficulty } from "@/lib/engines"
import { cn } from "@/lib/utils"

type Captured = { w: string[]; b: string[] }

type GameState = {
  status: "in_progress" | "finished"
  outcome: "win" | "loss" | "draw" | null
  result: string | null
  termination: "checkmate" | "stalemate" | "draw" | "resigned" | null
  label: string
}

/** Single source of truth for "how did this game end", shared by the status
 * line, the scoresheet footer, and what gets written to history. */
function describeGame(game: Chess, playerColor: PieceColor): GameState {
  const turn = game.turn()
  const side = turn === "w" ? "White" : "Black"

  if (game.isCheckmate()) {
    const winner: PieceColor = turn === "w" ? "b" : "w"
    return {
      status: "finished",
      outcome: winner === playerColor ? "win" : "loss",
      result: winner === "w" ? "1-0" : "0-1",
      termination: "checkmate",
      label: winner === playerColor ? "Checkmate. You win." : "Checkmate. You lose.",
    }
  }
  if (game.isStalemate()) {
    return {
      status: "finished",
      outcome: "draw",
      result: "1/2-1/2",
      termination: "stalemate",
      label: "Stalemate. Nobody wins.",
    }
  }
  if (game.isDraw()) {
    return { status: "finished", outcome: "draw", result: "1/2-1/2", termination: "draw", label: "Drawn." }
  }
  return {
    status: "in_progress",
    outcome: null,
    result: null,
    termination: null,
    label: game.inCheck() ? `${side} is in check` : `${side} to move`,
  }
}

export default function ChessGame() {
  // chess.js is mutable, so it lives in a ref and `version` drives re-renders.
  // Keeping it in state instead means every async engine reply races a stale
  // closure over the previous position.
  const game = useRef(new Chess())
  const [version, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)

  const [difficulty, setDifficulty] = useState<Difficulty>("normal")
  const [playerColor, setPlayerColor] = useState<PieceColor>("w")
  const [nextColor, setNextColor] = useState<PieceColor>("w")
  const [orientation, setOrientation] = useState<PieceColor>("w")
  const [selected, setSelected] = useState<string | null>(null)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  const [captured, setCaptured] = useState<Captured>({ w: [], b: [] })
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)
  const [resigned, setResigned] = useState(false)

  const [user, setUser] = useState<User | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  // Not state: the persisted game's id is read inside async callbacks that
  // would otherwise close over a stale value.
  const gameId = useRef<string | null>(null)

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
  }, [])

  const board = game.current.board()
  const turn = game.current.turn()
  const history = game.current.history()
  const state = describeGame(game.current, playerColor)
  const finished = resigned || state.status === "finished"
  const isPlayerTurn = turn === playerColor && !thinking && !finished

  /** Write the whole game state. A full replace rather than an append, so a
   * dropped or duplicated request cannot corrupt the stored move list. */
  const syncGame = useCallback(
    async (override?: Partial<GameState>) => {
      if (!gameId.current) return
      const current = { ...describeGame(game.current, playerColor), ...override }
      try {
        await fetch(`/api/games/${gameId.current}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moves: game.current.history(),
            fen: game.current.fen(),
            status: current.status,
            outcome: current.outcome,
            result: current.result,
            termination: current.termination,
          }),
        })
        if (current.status === "finished") {
          gameId.current = null // no further writes; the backend rejects them anyway
          setHistoryKey((k) => k + 1)
        }
      } catch {
        // History is a side effect of playing; a failed write must not
        // interrupt the game in progress.
      }
    },
    [playerColor],
  )

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
      if (!response.ok) throw new Error(data.error ?? "The engine did not answer.")

      // Always move by from/to: a UCI string is not SAN, and chess.js rejects it.
      const move = game.current.move({
        from: data.from,
        to: data.to,
        promotion: data.promotion ?? undefined,
      })
      recordCapture(move)
      setLastMove({ from: move.from, to: move.to })
      bump()
      void syncGame()
    } catch (err) {
      setError(err instanceof Error ? err.message : "The engine did not answer.")
    } finally {
      setThinking(false)
    }
  }, [difficulty, syncGame])

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
    void syncGame()
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

  const newGame = async () => {
    const color = nextColor
    game.current = new Chess()
    gameId.current = null
    setPlayerColor(color)
    setOrientation(color)
    setSelected(null)
    setLastMove(null)
    setCaptured({ w: [], b: [] })
    setPendingPromotion(null)
    setResigned(false)
    setError(null)
    bump()

    if (user) {
      try {
        const response = await fetch("/api/games", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ difficulty, playerColor: color }),
        })
        if (response.ok) {
          gameId.current = (await response.json()).id
          setHistoryKey((k) => k + 1)
        }
      } catch {
        // Play offline rather than blocking on the history service.
      }
    }

    if (color === "b") void requestEngineMove()
  }

  const resign = () => {
    if (finished || history.length === 0) return
    setResigned(true)
    void syncGame({
      status: "finished",
      outcome: "loss",
      result: playerColor === "w" ? "0-1" : "1-0",
      termination: "resigned",
    })
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
  const engine = ENGINES[difficulty]

  const statusLabel = resigned ? "You resigned." : state.label
  const resultLabel = resigned ? (playerColor === "w" ? "0-1" : "1-0") : state.result

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT"
      if (!typing && e.key === "f") setOrientation((o) => (o === "w" ? "b" : "w"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const quietButton =
    "border border-rule px-3 py-2 text-[15px] text-graphite transition-colors hover:border-graphite hover:text-chalk disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-graphite"

  return (
    <div className="min-h-screen">
      <header className="border-b border-brass/20 px-5 py-2">
        <span className="wide text-[15px] font-semibold tracking-tight">Chess AI</span>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-4 lg:flex-row lg:items-start lg:justify-center">
        <section className="flex w-full flex-col items-center lg:w-auto">
          <div style={{ width: "min(92vw, calc(100vh - 13rem))", maxWidth: "100%" }}>
            <PlayerRail
              name={engine.opponent}
              color={opponentColor}
              detail={engine.detail}
              captured={captured[playerColor]}
              capturedColor={playerColor}
              advantage={leader === opponentColor ? advantage : 0}
              thinking={thinking}
            />
          </div>

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

          <div style={{ width: "min(92vw, calc(100vh - 13rem))", maxWidth: "100%" }}>
            <PlayerRail
              name={user ? user.username : "You"}
              color={playerColor}
              detail={playerColor === "w" ? "playing white" : "playing black"}
              captured={captured[opponentColor]}
              capturedColor={opponentColor}
              advantage={leader === playerColor ? advantage : 0}
            />
          </div>
        </section>

        {/* One panel divided by hairlines, not a stack of identical cards. */}
        <aside className="w-full divide-y divide-rule border border-rule bg-slate lg:w-[21rem]">
          <div className="px-4 py-4">
            <p className={cn("wide text-2xl font-semibold leading-tight tracking-tight", finished && "text-brass")}>
              {statusLabel}
            </p>
            {error && <p className="mt-1.5 text-sm text-alarm">{error}</p>}
          </div>

          <Scoresheet moves={history} result={resultLabel} />

          <EngineSelector
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            disabled={thinking}
          />

          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-graphite">Play as</span>
              {(["w", "b"] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNextColor(color)}
                  aria-pressed={nextColor === color}
                  className={cn(
                    "border px-2.5 py-1 text-sm transition-colors",
                    nextColor === color
                      ? "border-brass text-chalk"
                      : "border-rule text-graphite hover:text-chalk",
                  )}
                >
                  {color === "w" ? "White" : "Black"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void newGame()}
              disabled={thinking}
              className="bg-brass px-3 py-2 text-[15px] font-semibold text-ink transition-colors hover:bg-[#D9A64C] disabled:opacity-40"
            >
              New game
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={resign}
                disabled={finished || history.length === 0}
                className={quietButton}
              >
                Resign
              </button>
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
                className={quietButton}
              >
                Flip board
              </button>
            </div>
          </div>

          <AuthPanel
            user={user}
            onAuthenticated={(u) => {
              setUser(u)
              setHistoryKey((k) => k + 1)
            }}
            onSignedOut={() => {
              setUser(null)
              gameId.current = null
            }}
          />

          {user && <GameHistory refreshKey={historyKey} />}
        </aside>
      </main>

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
    </div>
  )
}
