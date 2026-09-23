"use client"

import { PIECE_GLYPHS, PIECE_VALUES, type PieceColor } from "@/lib/chess-ui"
import { cn } from "@/lib/utils"

interface PlayerRailProps {
  name: string
  /** Which side this player is. */
  color: PieceColor
  /** Shown after the name: "engine · black", or just the colour. */
  detail?: string
  /** Single letter for the tile. */
  initial: string
  /** The opponent's tile is solid ink and set in the mark face; yours is the
   * gold-washed one. */
  variant: "opponent" | "you"
  /** Piece types this player has captured from the opponent. */
  captured: string[]
  /** Colour of the captured pieces, i.e. the opponent's colour. */
  capturedColor: PieceColor
  /** Material lead to print, or 0 to print nothing. */
  advantage: number
  /** True when it is this player's move. */
  active?: boolean
  thinking?: boolean
}

const ORDER = ["q", "r", "b", "n", "p"]

export default function PlayerRail({
  name,
  detail,
  initial,
  variant,
  captured,
  capturedColor,
  advantage,
  active,
  thinking,
}: PlayerRailProps) {
  const sorted = [...captured].sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b) || PIECE_VALUES[b] - PIECE_VALUES[a],
  )

  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold",
          variant === "opponent"
            ? "bg-ink font-mark text-[14px] text-white"
            : "border border-gold bg-goldwash text-goldink",
        )}
      >
        {initial}
      </span>

      <span className="truncate text-[15px] font-bold">{name}</span>
      {detail && <span className="truncate text-[13px] text-mute">{detail}</span>}

      <span className="ml-auto flex shrink-0 items-center gap-2.5">
        {sorted.length > 0 && (
          <span
            className={cn(
              "flex items-center text-[17px] leading-none [font-family:'Segoe_UI_Symbol','DejaVu_Sans',serif]",
              capturedColor === "w" ? "text-mute" : "text-ink/70",
            )}
          >
            {sorted.map((type, i) => (
              <span key={i} className="-ml-1.5 first:ml-0">
                {PIECE_GLYPHS[type]}
              </span>
            ))}
          </span>
        )}
        {advantage > 0 && (
          <span className="figures text-[13px] font-bold text-goldink">+{advantage}</span>
        )}
        {thinking && <span className="text-[13px] text-mute">thinking…</span>}
        <span
          aria-hidden
          className={cn("h-2 w-2 rounded-full", active ? "bg-gold" : "bg-idle")}
        />
      </span>
    </div>
  )
}
