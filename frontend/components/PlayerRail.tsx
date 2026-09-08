"use client"

import { PIECE_GLYPHS, PIECE_VALUES, type PieceColor } from "@/lib/chess-ui"
import { cn } from "@/lib/utils"

interface PlayerRailProps {
  name: string
  /** Which side this player is. */
  color: PieceColor
  /** Shown after the name, e.g. what the engine does. */
  detail?: string
  /** Piece types this player has captured from the opponent. */
  captured: string[]
  /** Colour of the captured pieces, i.e. the opponent's colour. */
  capturedColor: PieceColor
  /** Material lead to print, or 0 to print nothing. */
  advantage: number
  /** True when it is this player's move. */
  active?: boolean
  thinking?: boolean
  /** The rail above the board takes its hairline below, and vice versa. */
  edge: "top" | "bottom"
}

const ORDER = ["q", "r", "b", "n", "p"]

/** A line of type on the ground rather than a filled block, with one accent
 * dot for whose move it is - the turn used to be stated only in words, off in
 * a column beside the board. */
export default function PlayerRail({
  name,
  color,
  detail,
  captured,
  capturedColor,
  advantage,
  active,
  thinking,
  edge,
}: PlayerRailProps) {
  const sorted = [...captured].sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b) || PIECE_VALUES[b] - PIECE_VALUES[a],
  )

  return (
    <div
      className={cn(
        "flex h-12 w-full items-center gap-2.5",
        edge === "top" ? "border-b border-rule" : "border-t border-rule",
      )}
    >
      <span
        aria-hidden
        className={cn("h-[7px] w-[7px] shrink-0 rounded-full", active ? "bg-brass" : "bg-transparent")}
      />
      <span className="truncate text-[16px] font-medium">{name}</span>
      {detail && <span className="truncate text-sm text-graphite">{detail}</span>}

      <span className="ml-auto flex shrink-0 items-center gap-3">
        {sorted.length > 0 && (
          <span
            className="flex items-center text-lg leading-none text-graphite"
            style={{ color: capturedColor === "w" ? "#C9CDD1" : "#4B5157" }}
          >
            {sorted.map((type, i) => (
              <span key={i} className="-ml-1.5 first:ml-0">
                {PIECE_GLYPHS[type]}
              </span>
            ))}
          </span>
        )}
        {advantage > 0 && <span className="figures text-sm text-brass">+{advantage}</span>}
        {thinking && (
          <span className="flex items-center gap-2 text-sm text-graphite">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brass/70 border-t-transparent" />
            thinking
          </span>
        )}
      </span>
    </div>
  )
}
