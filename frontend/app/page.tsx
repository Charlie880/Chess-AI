"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Chess, type Move } from "chess.js"

import AuthPanel, { type User } from "@/components/AuthPanel"
import ChessBoard from "@/components/ChessBoard"
import EngineSelector from "@/components/EngineSelector"
import GameHistory from "@/components/GameHistory"
import PlayerRail from "@/components/PlayerRail"
import PromotionDialog from "@/components/PromotionDialog"
import Scoresheet from "@/components/Scoresheet"
import { materialBalance, type PieceColor, type PlayedMove } from "@/lib/chess-ui"
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
  // Which engine actually produced the last move. The backend falls back to
  // minimax when an engine declines, and the UI should not keep claiming you
  // are playing a neural net that never loaded.
  const [actualEngine, setActualEngine] = useState<Difficulty | null>(null)

  const [user, setUser] = useState<User | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  // Not state: the persisted game's id is read inside async callbacks that
  // would otherwise close over a stale value.
  const gameId = useRef<string | null>(null)
  const router = useRouter()
  const [openingRoom, setOpeningRoom] = useState(false)

  const loadIdentity = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
  }, [])

  useEffect(loadIdentity, [loadIdentity])

  const board = game.current.board()
  const turn = game.current.turn()
  const history = game.current.history()
  const playedMoves = game.current.history({ verbose: true }) as unknown as PlayedMove[]
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
      if (data.engine) setActualEngine(data.engine as Difficulty)
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
    setActualEngine(null)
    setError(null)
    bump()

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

    if (color === "b") void requestEngineMove()
  }

  const resign = () => {
    // Resigning mid-search would save the pre-move position while the engine's
    // reply still lands on the board, leaving the two out of step.
    if (finished || thinking || history.length === 0) return
    setResigned(true)
    void syncGame({
      status: "finished",
      outcome: "loss",
      result: playerColor === "w" ? "0-1" : "1-0",
      termination: "resigned",
    })
  }

  const openRoom = async () => {
    setOpeningRoom(true)
    try {
      const response = await fetch("/api/rooms", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not open a room")
      router.push(`/room/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open a room")
      setOpeningRoom(false)
    }
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
  const engine = ENGINES[actualEngine ?? difficulty]
  const substituted = actualEngine !== null && actualEngine !== difficulty
  // The engine is stuck if it was its turn and the request failed.
  const engineStalled = error !== null && !thinking && !finished && turn !== playerColor

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

  const quiet = "text-left text-[15px] text-graphite transition-colors hover:text-chalk disabled:opacity-40 disabled:hover:text-graphite"
  const boardWidth = { width: "min(92vw, calc(100vh - 13.5rem))", maxWidth: "100%" }

  return (
    <div className="min-h-screen">
      {/* Global controls live up here, not stacked beside the board. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-rule px-6 py-3 sm:px-14">
        <span className="wide text-base font-semibold tracking-tight">Chess AI</span>
        <EngineSelector
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          disabled={thinking || history.length > 0}
        />
        <div className="flex items-center justify-end gap-6">
          <AuthPanel user={user} onAuthenticated={(u) => { setUser(u); setHistoryKey((k) => k + 1) }} onSignedOut={() => { gameId.current = null; loadIdentity(); setHistoryKey((k) => k + 1) }} />
          <button
            type="button"
            onClick={() => void newGame()}
            disabled={thinking}
            className="text-[15px] font-semibold text-brass transition-colors hover:text-[#E6B75C] disabled:opacity-40"
          >
            New game
          </button>
        </div>
      </header>

      {/* Board dead-centre, one job in each flanking column. */}
      <main className="mx-auto grid max-w-[1328px] justify-center gap-x-10 gap-y-8 px-6 py-7 sm:px-10 lg:grid-cols-[minmax(0,17.5rem)_auto_minmax(0,17.5rem)] xl:gap-x-14 lg:items-start">
        <div className="order-2 lg:order-1 lg:pt-12">
          <p
            className={cn(
              "wide text-[30px] font-semibold leading-tight tracking-tight",
              finished && "text-brass",
            )}
          >
            {statusLabel}
          </p>

          {error && <p className="mt-3 text-[15px] text-alarm">{error}</p>}

          {engineStalled && (
            <button
              type="button"
              onClick={() => void requestEngineMove()}
              className="mt-3 text-[15px] font-semibold text-brass hover:text-[#E6B75C]"
            >
              Try that move again
            </button>
          )}

          <div className="mt-8 border-t border-rule pt-5">
            <p className="text-[15px] font-medium">{engine.opponent}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-graphite">{engine.detail}</p>
            {substituted && !error && (
              <p className="mt-2 text-sm leading-relaxed text-graphite">
                {ENGINES[difficulty].label} is unavailable, so {engine.opponent} is playing instead.
              </p>
            )}
          </div>

          <div className="mt-7 flex items-center gap-3">
            <span className="text-sm text-graphite">Play as</span>
            {(["w", "b"] as const).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNextColor(color)}
                aria-pressed={nextColor === color}
                className={cn(
                  "text-sm transition-colors",
                  nextColor === color ? "text-chalk underline decoration-brass underline-offset-4" : "text-graphite hover:text-chalk",
                )}
              >
                {color === "w" ? "White" : "Black"}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-col items-start gap-3.5">
            <button type="button" onClick={resign} disabled={finished || thinking || history.length === 0} className={quiet}>
              Resign
            </button>
            <button type="button" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))} className={quiet}>
              Flip board
            </button>
            <button
              type="button"
              onClick={() => void openRoom()}
              disabled={openingRoom}
              className="text-left text-[15px] font-semibold text-brass transition-colors hover:text-[#E6B75C] disabled:opacity-40"
            >
              {openingRoom ? "Opening a room…" : "Play someone else"}
            </button>
          </div>
        </div>

        <section className="order-1 flex flex-col items-center lg:order-2">
          <div style={boardWidth}>
            <PlayerRail
              name={engine.opponent}
              color={opponentColor}
              detail="engine"
              captured={captured[playerColor]}
              capturedColor={playerColor}
              advantage={leader === opponentColor ? advantage : 0}
              active={turn === opponentColor && !finished}
              thinking={thinking}
              edge="top"
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

          <div style={boardWidth}>
            <PlayerRail
              name={user ? user.username : "You"}
              color={playerColor}
              detail={playerColor === "w" ? "white" : "black"}
              captured={captured[opponentColor]}
              capturedColor={opponentColor}
              advantage={leader === playerColor ? advantage : 0}
              active={turn === playerColor && !finished}
              edge="bottom"
            />
          </div>
        </section>

        <div className="order-3 lg:pt-12">
          <Scoresheet moves={playedMoves} result={resultLabel} />
        </div>
      </main>

      <GameHistory refreshKey={historyKey} />

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
