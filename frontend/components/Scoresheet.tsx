"use client"

import { useEffect, useRef } from "react"
import { describeMove, PIECE_GLYPHS, type PlayedMove } from "@/lib/chess-ui"
import { cn } from "@/lib/utils"

interface ScoresheetProps {
  moves: PlayedMove[]
  result: string | null
}

/** One row per half-move: the piece that moved on a tile, the move written out
 * in words, and the notation in the margin. */
export default function Scoresheet({ moves, result }: ScoresheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [moves.length])

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] font-bold tracking-[0.16em] text-mute">MOVES</span>
        <span className="figures text-xs text-mute">
          {moves.length === 0 ? "" : `${moves.length} ${moves.length === 1 ? "move" : "moves"}`}
        </span>
      </div>

      {moves.length === 0 ? (
        <p className="text-[13px] text-mute">Make your first move.</p>
      ) : (
        <div ref={scrollRef} className="-mx-1 flex-1 overflow-y-auto px-1">
          <ol className="flex flex-col gap-0.5">
            {moves.map((move, i) => (
              <li
                key={i}
                className={cn(
                  "grid grid-cols-[20px_28px_1fr_auto] items-center gap-2 rounded-md px-2.5 py-1.5",
                  i === moves.length - 1 && "bg-goldwash",
                )}
              >
                <span className="figures text-xs text-mute">{i + 1}</span>
                <span
                  aria-hidden
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md bg-glyphchip text-[22px] leading-none",
                    "[font-family:'Segoe_UI_Symbol','DejaVu_Sans',serif]",
                    move.color === "w" ? "text-white" : "text-ink",
                  )}
                  style={{ WebkitTextStroke: move.color === "w" ? "1px #1a1a1a" : "0" }}
                >
                  {PIECE_GLYPHS[move.piece]}
                </span>
                <span className="text-[13px] font-semibold">{describeMove(move)}</span>
                <span className="figures text-xs font-bold text-goldink">{move.san}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result && (
        <p className="figures mt-3 border-t border-divider pt-3 text-center text-[13px] font-bold text-goldink">
          {result}
        </p>
      )}
    </>
  )
}
