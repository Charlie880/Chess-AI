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
const BOARD_SIZE = "min(90vw, calc(100vh - 14rem))"
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

  const coordStyle: CSSProperties = { fontSize: `calc(${SQUARE} * 0.2)` }

  return (
    <div className="select-none" style={{ width: BOARD_SIZE, maxWidth: "100%" }}>
      <div
        // Rows are 1fr of a square container, so a square stays square no matter
        // what a glyph's line box wants. Letting the children set their own
        // height via aspect-ratio lets one tall glyph stretch its whole row.
        className="grid aspect-square w-full grid-cols-8 [grid-template-rows:repeat(8,1fr)] overflow-hidden rounded-sm border-4 border-[#3d2b1f] shadow-2xl"
        style={{ fontSize: `calc(${SQUARE} * 0.74)` }}
      >
        {ranks.map((rank, rowIdx) =>
          files.map((file, colIdx) => {
            const square = `${file}${rank}`
            // `board` is always stored white-side-up; index into it by the real
            // rank/file so flipping the view never flips the position.
            const piece = board[RANKS.indexOf(rank)][FILES.indexOf(file)]

            const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0
            const isSelected = selected === square
            const isTarget = legalTargets.has(square)
            const isCapture = isTarget && piece !== null
            const isLast = lastMove?.from === square || lastMove?.to === square
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
                  isLight ? "bg-[#eeeed2]" : "bg-[#769656]",
                  (isLast || isSelected) && (isLight ? "bg-[#f6f669]" : "bg-[#baca2b]"),
                  inCheck && "bg-[radial-gradient(circle,#ff5252_0%,#c62828_65%,transparent_78%)]",
                  interactive ? "cursor-pointer" : "cursor-default",
                )}
              >
                {showFile && (
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-0 right-0.5 font-bold leading-none",
                      isLight ? "text-[#769656]" : "text-[#eeeed2]",
                    )}
                    style={coordStyle}
                  >
                    {file}
                  </span>
                )}
                {showRank && (
                  <span
                    className={cn(
                      "pointer-events-none absolute left-0.5 top-0 font-bold leading-none",
                      isLight ? "text-[#769656]" : "text-[#eeeed2]",
                    )}
                    style={coordStyle}
                  >
                    {rank}
                  </span>
                )}

                {piece && (
                  <span
                    className={cn(
                      "pointer-events-none leading-none",
                      piece.color === "w" ? "text-white" : "text-[#181818]",
                    )}
                    style={{
                      // A hard contrasting outline is what separates the two
                      // sides when both are drawn from the same solid glyph.
                      textShadow:
                        piece.color === "w"
                          ? "0 0 1px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000"
                          : "0 0 1px rgba(255,255,255,.35), 1px 1px 0 rgba(0,0,0,.4)",
                    }}
                  >
                    {PIECE_GLYPHS[piece.type]}
                  </span>
                )}

                {isTarget && !isCapture && (
                  <span className="pointer-events-none absolute h-[28%] w-[28%] rounded-full bg-black/25" />
                )}
                {isCapture && (
                  <span className="pointer-events-none absolute inset-[6%] rounded-full border-[0.14em] border-black/25" />
                )}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
