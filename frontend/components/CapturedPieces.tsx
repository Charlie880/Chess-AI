"use client"

import { PIECE_GLYPHS, PIECE_VALUES, type PieceColor } from "@/lib/chess-ui"

interface CapturedPiecesProps {
  label: string
  /** Piece types this player has captured from the opponent. */
  captured: string[]
  /** Colour of the captured pieces, i.e. the opponent's colour. */
  color: PieceColor
  /** Material lead to print, or 0 to print nothing. */
  advantage: number
  thinking?: boolean
}

const ORDER = ["q", "r", "b", "n", "p"]

export default function CapturedPieces({ label, captured, color, advantage, thinking }: CapturedPiecesProps) {
  const sorted = [...captured].sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b) || PIECE_VALUES[b] - PIECE_VALUES[a],
  )

  return (
    <div className="flex min-h-[2rem] items-center gap-2 text-neutral-300">
      <span className="text-sm font-semibold">{label}</span>
      <span
        className="flex flex-wrap items-center text-lg leading-none"
        style={{ color: color === "w" ? "#f0f0f0" : "#3a3a3a" }}
      >
        {sorted.map((type, i) => (
          <span key={i} className="-ml-1 first:ml-0">
            {PIECE_GLYPHS[type]}
          </span>
        ))}
      </span>
      {advantage > 0 && <span className="text-sm text-neutral-400">+{advantage}</span>}
      {thinking && (
        <span className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-500 border-t-transparent" />
          thinking…
        </span>
      )}
    </div>
  )
}
