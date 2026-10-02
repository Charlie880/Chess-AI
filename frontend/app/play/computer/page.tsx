"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Chess, type Move } from "chess.js"

import AuthPanel, { type User } from "@/components/AuthPanel"
import BackLink from "@/components/BackLink"
import ChessBoard from "@/components/ChessBoard"
import EngineSelector from "@/components/EngineSelector"
import GameHistory from "@/components/GameHistory"
import PlayerRail from "@/components/PlayerRail"
import PromotionDialog from "@/components/PromotionDialog"
import Scoresheet from "@/components/Scoresheet"
import SiteMark from "@/components/SiteMark"
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

/** Single source of truth for "how did this game end", shared by the display
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
      label: "Stalemate",
    }
  }
  if (game.isDraw()) {
    return { status: "finished", outcome: "draw", result: "1/2-1/2", termination: "draw", label: "Drawn" }
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
  // `playerColor` is the colour of the game on the board. `pendingColor` is
  // what the picker shows, which can differ only once a game has finished and
  // you are choosing sides for the next one.
  const [playerColor, setPlayerColor] = useState<PieceColor>("w")
  const [pendingColor, setPendingColor] = useState<PieceColor>("w")
  // Async callbacks need the colour of the game they belong to, and setState
  // has not flushed by the time the opening engine move fires.
  const colorRef = useRef<PieceColor>("w")
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
  // The player's move and the engine's reply both persist, and the second can
  // start before the first create resolves. Without holding the in-flight
  // promise, each would create its own record and every game would appear
  // twice in history.
  const creating = useRef<Promise<string | null> | null>(null)
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

  /** Write the whole game state, creating the record on the first move.
   *
   * Creating it lazily matters twice over: choosing a colour or an engine
   * before you move costs nothing, and opening the page without playing leaves
   * no empty "Playing" row in your history.
   *
   * A full replace rather than an append, so a dropped or duplicated request
   * cannot corrupt the stored move list. */
  const persist = useCallback(
    async (override?: Partial<GameState>) => {
      if (!gameId.current) {
        creating.current ??= (async () => {
          try {
            const created = await fetch("/api/games", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ difficulty, playerColor: colorRef.current }),
            })
            if (!created.ok) return null
            const { id } = await created.json()
            gameId.current = id
            setHistoryKey((k) => k + 1)
            return id as string
          } catch {
            return null // play offline rather than blocking on history
          }
        })()
        if (!(await creating.current)) return
      }

      const current = { ...describeGame(game.current, colorRef.current), ...override }
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
    [difficulty],
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
      void persist()
    } catch (err) {
      setError(err instanceof Error ? err.message : "The engine did not answer.")
    } finally {
      setThinking(false)
    }
  }, [difficulty, persist])

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
    void persist()
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

  const startGame = (color: PieceColor) => {
    game.current = new Chess()
    gameId.current = null
    colorRef.current = color
    creating.current = null
    setPlayerColor(color)
    setPendingColor(color)
    setOrientation(color)
    setSelected(null)
    setLastMove(null)
    setCaptured({ w: [], b: [] })
    setPendingPromotion(null)
    setResigned(false)
    setActualEngine(null)
    setError(null)
    bump()

    if (color === "b") void requestEngineMove()
  }

  /** Before a move is played there is nothing to lose, so picking a side takes
   * effect at once - the board flips and, as black, the engine opens. Once a
   * game has finished the choice is staged for the next one instead, so the
   * final position stays on screen. */
  const chooseColor = (color: PieceColor) => {
    setPendingColor(color)
    if (history.length === 0) startGame(color)
  }

  const undo = () => {
    // Undo two moves: the player's move and the engine's reply
    if (!inProgress || thinking || history.length < 2) return
    game.current.undo() // Engine's move
    game.current.undo() // Player's move
    setCaptured((prev) => {
      // Recompute captured pieces from remaining moves
      const newCaptured: Captured = { w: [], b: [] }
      game.current.history({ verbose: true }).forEach((move) => {
        if (move.captured) {
          const victim: PieceColor = move.color === "w" ? "b" : "w"
          newCaptured[victim].push(move.captured)
        }
      })
      return newCaptured
    })
    setLastMove(null)
    bump()
    void persist()
  }

  const resign = () => {
    // Resigning mid-search would save the pre-move position while the engine's
    // reply still lands on the board, leaving the two out of step.
    if (!inProgress || thinking) return
    setResigned(true)
    void persist({
      status: "finished",
      outcome: "loss",
      result: colorRef.current === "w" ? "0-1" : "1-0",
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

  // A game is under way once a move exists and it has not ended. That, not
  // "any move has ever been played", is what the pickers lock against: after
  // checkmate you are choosing sides for the next game, not changing this one.
  const inProgress = history.length > 0 && !finished
  const locked = inProgress || thinking

  const { advantage, leader } = materialBalance(captured)
  const opponentColor: PieceColor = playerColor === "w" ? "b" : "w"
  const engine = ENGINES[actualEngine ?? difficulty]
  const substituted = actualEngine !== null && actualEngine !== difficulty
  // The engine is stuck if it was its turn and the request failed.
  const engineStalled = error !== null && !thinking && !finished && turn !== playerColor

  const statusLabel = resigned ? "You resigned" : state.label
  const resultLabel = resigned ? (playerColor === "w" ? "0-1" : "1-0") : state.result
  const moveNumber = Math.floor(history.length / 2) + 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT"
      if (!typing && e.key === "f") setOrientation((o) => (o === "w" ? "b" : "w"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const quietButton =
    "h-11 rounded-lg border border-field bg-white text-[13px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40 disabled:hover:border-field"

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line bg-white lg:grid lg:grid-cols-[1fr_auto_1fr]"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <div className="flex items-center gap-4">
          <SiteMark />
          <BackLink href="/play">Menu</BackLink>
        </div>

        <div className="order-last flex w-full justify-center lg:order-none lg:w-auto">
          <EngineSelector
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            disabled={locked}
            lockedReason={
              inProgress ? "Finish or resign this game to change engine" : undefined
            }
          />
        </div>

        <div className="flex items-center justify-end gap-[18px]">
          <AuthPanel
            user={user}
            onSignedOut={() => {
              // Signing out drops back to the guest identity, so re-ask rather
              // than assuming there is nobody here.
              gameId.current = null
              loadIdentity()
              setHistoryKey((k) => k + 1)
            }}
          />
          <button
            type="button"
            onClick={() => startGame(pendingColor)}
            disabled={thinking}
            className="h-10 rounded-lg bg-ink px-[18px] text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b] disabled:opacity-40"
          >
            NEW GAME
          </button>
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
            <div className="mb-2 text-[11px] font-bold tracking-[0.16em] text-mute">
              MOVE {moveNumber}
            </div>
            <h1
              className={cn(
                "font-display text-[40px] font-medium leading-[1.05] tracking-[-0.01em]",
                finished && "text-goldink",
              )}
            >
              {statusLabel}
            </h1>
          </div>

          {error && (
            <div className="flex flex-col gap-2.5 rounded-[10px] border border-alarm-line bg-alarm-surface px-4 py-3.5">
              <p className="text-[13px] leading-[1.5] text-alarm [text-wrap:pretty]">{error}</p>
              {engineStalled && (
                <button
                  type="button"
                  onClick={() => void requestEngineMove()}
                  className="self-start text-[13px] font-bold text-ink underline decoration-gold underline-offset-4"
                >
                  Try that move again
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-[18px]">
            <div>
              <div className="text-[15px] font-bold">{engine.opponent}</div>
              <div className="mt-1 text-[13px] leading-[1.5] text-slate">{engine.detail}</div>
              {substituted && !error && (
                <div className="mt-2 text-[13px] leading-[1.5] text-slate">
                  {ENGINES[difficulty].label} is unavailable, so {engine.opponent} is playing
                  instead.
                </div>
              )}
            </div>

            <div className="h-px bg-divider" />

            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-slate">Play as</span>
              <div className="flex gap-1 rounded-lg bg-chip p-[3px]">
                {(["w", "b"] as const).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => chooseColor(color)}
                    disabled={locked}
                    aria-pressed={pendingColor === color}
                    title={inProgress ? "Finish or resign this game to switch sides" : undefined}
                    className={cn(
                      "rounded-md px-3.5 py-1.5 text-xs font-bold transition-colors",
                      pendingColor === color
                        ? "bg-ink text-white"
                        : cn("text-slate", locked ? "opacity-50" : "hover:text-ink"),
                      locked && "cursor-not-allowed",
                    )}
                  >
                    {color === "w" ? "White" : "Black"}
                  </button>
                ))}
              </div>
            </div>

            {/* One line covering both pickers, so a disabled control is never
                just greyed out with no reason given. */}
            {inProgress && (
              <p className="-mt-1 text-xs leading-[1.5] text-mute">
                Engine and colour are locked while a game is on. Finish it, or resign.
              </p>
            )}
            {finished && pendingColor !== playerColor && (
              <p className="-mt-1 text-xs leading-[1.5] text-mute">
                You will play {pendingColor === "w" ? "white" : "black"} next game.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              className={quietButton}
            >
              Flip board
            </button>
            <button
              type="button"
              onClick={undo}
              disabled={!inProgress || thinking || history.length < 2}
              className={quietButton}
              title={history.length < 2 ? "Make a move to undo" : "Undo last two moves"}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={resign}
              disabled={finished || thinking || history.length === 0}
              className={quietButton}
            >
              Resign
            </button>
            <button
              type="button"
              onClick={() => void openRoom()}
              disabled={openingRoom}
              className="h-11 rounded-lg border border-gold bg-goldwash text-[13px] font-bold text-goldink transition-colors hover:bg-goldwarm disabled:opacity-40"
            >
              {openingRoom ? "Opening a room…" : "Play someone else"}
            </button>
          </div>
        </aside>

        <section
          className="flex min-w-0 flex-[1_1_420px] flex-col gap-3"
          style={{ maxWidth: "min(640px, calc(100vh - 16rem))" }}
        >
          <PlayerRail
            name={engine.opponent}
            color={opponentColor}
            detail={`engine · ${opponentColor === "w" ? "white" : "black"}`}
            initial={engine.opponent.charAt(0)}
            variant="opponent"
            captured={captured[playerColor]}
            capturedColor={playerColor}
            advantage={leader === opponentColor ? advantage : 0}
            active={turn === opponentColor && !finished}
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

          <PlayerRail
            name={user ? user.username : "You"}
            color={playerColor}
            detail={playerColor === "w" ? "white" : "black"}
            initial={(user?.username ?? "You").charAt(0).toUpperCase()}
            variant="you"
            captured={captured[opponentColor]}
            capturedColor={opponentColor}
            advantage={leader === playerColor ? advantage : 0}
            active={turn === playerColor && !finished}
          />
        </section>

        <aside
          className="sticky top-6 flex flex-[0_0_260px] flex-col self-stretch overflow-auto rounded-xl border border-line bg-white p-[18px]"
          style={{ maxHeight: "calc(100vh - 140px)" }}
        >
          <Scoresheet moves={playedMoves} result={resultLabel} />
        </aside>
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
