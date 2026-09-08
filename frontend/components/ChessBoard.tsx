"use client"

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { FILES, PIECE_GLYPHS, RANKS, type PieceColor } from "@/lib/chess-ui"

type Piece = { type: string; color: PieceColor } | null

interface ChessBoardProps {
  /** 8 ranks from rank 8 down to rank 1, as returned by chess.js `board()`. */
  board: Piece[][]
  orientation: PieceColor
  selected: string | null
  legalTargets: Set<string>
  lastMove: { from: string; to: string } | null
  checkSquare: string | null
  interactive: boolean
  onSquareClick: (square: string) => void
}

// One expression owns the board's size, and everything inside is a fraction of
// it. Sizing glyphs off `vw` instead makes them overflow their square whenever
// the viewport is wide but short, because then it is the height that caps the
// board and the glyph never hears about it.
const BOARD_SIZE = "min(92vw, calc(100vh - 13.5rem))"
const SQUARE = `calc(${BOARD_SIZE} / 8)`

export default function ChessBoard({
  board,
  orientation,
  selected,
  legalTargets,
  lastMove,
  checkSquare,
  interactive,
  onSquareClick,
}: ChessBoardProps) {
  const files = orientation === "w" ? FILES : [...FILES].reverse()
  const ranks = orientation === "w" ? RANKS : [...RANKS].reverse()

  const coordStyle: CSSProperties = { fontSize: `calc(${SQUARE} * 0.17)` }

  return (
    <div className="select-none" style={{ width: BOARD_SIZE, maxWidth: "100%" }}>
      <div
        // No wooden surround: the board is the object, held by a single
        // hairline and lifted off the ground by one soft shadow.
        className="grid aspect-square w-full grid-cols-8 [grid-template-rows:repeat(8,1fr)] shadow-[0_0_0_1px_#23272B,0_24px_60px_-24px_rgba(0,0,0,.8)]"
        style={{ fontSize: `calc(${SQUARE} * 0.72)` }}
      >
        {ranks.map((rank, rowIdx) =>
          files.map((file, colIdx) => {
            const square = `${file}${rank}`
            // `board` is always stored white-side-up; index into it by the
            // real rank/file so flipping the view never flips the position.
            const piece = board[RANKS.indexOf(rank)][FILES.indexOf(file)]

            const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0
            const isSelected = selected === square
            const isTarget = legalTargets.has(square)
            const isCapture = isTarget && piece !== null
            const isLast = lastMove?.from === square || lastMove?.to === square
            const isArrival = lastMove?.to === square
            const inCheck = checkSquare === square

            // Coordinates ride in the margins of the edge squares, the way a
            // printed board labels them - no extra gutter row or column.
            const showFile = rowIdx === 7
            const showRank = colIdx === 0

            return (
              <button
                key={square}
                type="button"
                onClick={() => onSquareClick(square)}
                disabled={!interactive}
                aria-label={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ", empty"}`}
                className={cn(
                  "relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden",
                  isLight ? "bg-board-light" : "bg-board-dark",
                  // An inset rule rather than a coloured fill, so the surface
                  // stays monochrome and the accent keeps its meaning.
                  isLast && "shadow-[inset_0_0_0_2px_rgba(216,163,63,.55)]",
                  isSelected && "shadow-[inset_0_0_0_3px_#D8A33F]",
                  inCheck && "bg-[radial-gradient(circle,#E07A63_0%,#C4523E_62%,transparent_78%)]",
                  interactive ? "cursor-pointer" : "cursor-default",
                )}
              >
                {showFile && (
                  <span
                    className={cn(
                      "narrow pointer-events-none absolute bottom-0.5 right-1 font-medium leading-none",
                      isLight ? "text-ink/70" : "text-white/80",
                    )}
                    style={coordStyle}
                  >
                    {file}
                  </span>
                )}
                {showRank && (
                  <span
                    className={cn(
                      "narrow figures pointer-events-none absolute left-1 top-0.5 font-medium leading-none",
                      isLight ? "text-ink/70" : "text-white/80",
                    )}
                    style={coordStyle}
                  >
                    {rank}
                  </span>
                )}

                {piece && (
                  <span
                    key={`${square}-${piece.color}${piece.type}`}
                    className={cn(
                      "pointer-events-none leading-none",
                      piece.color === "w" ? "text-[#FAF9F7]" : "text-[#1A1C1E]",
                      isArrival && "animate-settle",
                    )}
                    style={{
                      // Both sides are drawn from the same solid glyph, so the
                      // white one needs an outline to separate from a bone
                      // square. Lighter than before, since the board no longer
                      // fights it.
                      textShadow:
                        piece.color === "w"
                          ? "0 0 1px rgba(26,28,30,.9), 1px 1px 0 rgba(26,28,30,.55)"
                          : "0 0 1px rgba(250,249,247,.35)",
                    }}
                  >
                    {PIECE_GLYPHS[piece.type]}
                  </span>
                )}

                {/* The marker flips with the square. A dark dot cannot reach
                    the 3:1 non-text contrast floor on the graphite square - it
                    caps at 2.86:1 even fully opaque - so on dark squares it is
                    drawn light instead. */}
                {isTarget && !isCapture && (
                  <span
                    className={cn(
                      "pointer-events-none absolute h-[24%] w-[24%] rounded-full",
                      isLight ? "bg-ink/55" : "bg-white/60",
                    )}
                  />
                )}
                {isCapture && (
                  <span
                    className={cn(
                      "pointer-events-none absolute inset-[5%] rounded-full border-[0.12em]",
                      isLight ? "border-ink/55" : "border-white/60",
                    )}
                  />
                )}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
