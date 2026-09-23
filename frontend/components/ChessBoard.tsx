"use client"

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

  return (
    <div className="grid aspect-square w-full select-none grid-cols-8 overflow-hidden rounded-md shadow-board">
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
          const isArrival = lastMove?.to === square
          const inCheck = checkSquare === square

          // Coordinates ride the viewed edges, so they stay bottom-left when
          // the board is flipped.
          const showRank = colIdx === 0
          const showFile = rowIdx === 7

          return (
            <button
              key={square}
              type="button"
              onClick={() => onSquareClick(square)}
              disabled={!interactive}
              aria-label={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ", empty"}`}
              className={cn(
                // `container-type: size` is what lets the glyph be sized as a
                // fraction of its own square rather than of the viewport.
                "relative flex items-center justify-center [container-type:size]",
                isLight ? "bg-board-light" : "bg-board-dark",
                isLast && (isLight ? "bg-board-last-light" : "bg-board-last-dark"),
                isSelected && "bg-board-sel shadow-[inset_0_0_0_3px_#b8963e]",
                inCheck && "bg-[radial-gradient(circle,#e8b0a5_0%,#dba193_62%,transparent_78%)]",
                interactive ? "cursor-pointer" : "cursor-default",
              )}
            >
              {showRank && (
                <span
                  className="pointer-events-none absolute left-[5px] top-[3px] text-[11px] font-bold leading-none text-coord"
                >
                  {rank}
                </span>
              )}
              {showFile && (
                <span
                  className="pointer-events-none absolute bottom-[2px] right-[5px] text-[11px] font-bold leading-none text-coord"
                >
                  {file}
                </span>
              )}

              {piece && (
                <span
                  key={`${square}-${piece.color}${piece.type}`}
                  className={cn(
                    "pointer-events-none text-[78cqh] leading-none",
                    "[font-family:'Segoe_UI_Symbol','DejaVu_Sans',serif]",
                    piece.color === "w" ? "text-white" : "text-ink",
                    isArrival && "animate-settle",
                  )}
                  style={{
                    // Both sides are drawn from the same solid glyph, so the
                    // white one is outlined rather than filled.
                    WebkitTextStroke: piece.color === "w" ? "1.2px #1a1a1a" : "0",
                    textShadow:
                      piece.color === "w"
                        ? "0 2px 2px rgba(0,0,0,.18)"
                        : "0 2px 2px rgba(0,0,0,.12)",
                  }}
                >
                  {PIECE_GLYPHS[piece.type]}
                </span>
              )}

              {isTarget && !isCapture && (
                <span className="pointer-events-none absolute h-[26%] w-[26%] rounded-full bg-ink/55" />
              )}
              {isCapture && (
                <span className="pointer-events-none absolute inset-[6%] rounded-full border-[0.1em] border-ink/55" />
              )}
            </button>
          )
        }),
      )}
    </div>
  )
}
