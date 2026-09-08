"use client"

import { PIECE_GLYPHS, PIECE_VALUES, type PieceColor } from "@/lib/chess-ui"
import { cn } from "@/lib/utils"

interface PlayerRailProps {
  name: string
  /** Which side this player is. Drives the swatch. */
  color: PieceColor
  /** Shown under the name for the engine side, e.g. what the search does. */
  detail?: string
  /** Piece types this player has captured from the opponent. */
  captured: string[]
  /** Colour of the captured pieces, i.e. the opponent's colour. */
  capturedColor: PieceColor
  /** Material lead to print, or 0 to print nothing. */
  advantage: number
  thinking?: boolean
}

const ORDER = ["q", "r", "b", "n", "p"]

export default function PlayerRail({
  name,
  color,
  detail,
  captured,
  capturedColor,
  advantage,
  thinking,
}: PlayerRailProps) {
  const sorted = [...captured].sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b) || PIECE_VALUES[b] - PIECE_VALUES[a],
  )

  return (
    <div className="flex w-full items-center gap-3 py-2">
      <span
        aria-hidden
        className={cn(
          "h-3.5 w-3.5 shrink-0 border",
          color === "w" ? "border-frame bg-[#F7F3EA]" : "border-graphite/50 bg-[#211F1C]",
        )}
      />

      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold leading-tight">{name}</span>
        {detail && <span className="block truncate text-xs leading-tight text-graphite">{detail}</span>}
      </span>

      <span
        className="ml-auto flex shrink-0 flex-wrap items-center text-lg leading-none"
        style={{ color: capturedColor === "w" ? "#F7F3EA" : "#4A4640" }}
      >
        {sorted.map((type, i) => (
          <span key={i} className="-ml-1.5 first:ml-0">
            {PIECE_GLYPHS[type]}
          </span>
        ))}
      </span>

      {advantage > 0 && (
        <span className="figures shrink-0 text-sm font-semibold text-brass">+{advantage}</span>
      )}

      {thinking && (
        <span className="flex shrink-0 items-center gap-2 text-sm text-graphite">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brass/70 border-t-transparent" />
          thinking
        </span>
      )}
    </div>
  )
}
