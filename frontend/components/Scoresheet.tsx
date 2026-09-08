"use client"

import { useEffect, useRef } from "react"
import { describeMove, type PlayedMove } from "@/lib/chess-ui"
import { cn } from "@/lib/utils"

interface ScoresheetProps {
  moves: PlayedMove[]
  result: string | null
}

/** One row per half-move, written out in words. Notation still rides along on
 * the right for anyone who reads it, and the swatch says whose move it was
 * using the same mark as the player rails. */
export default function Scoresheet({ moves, result }: ScoresheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [moves.length])

  return (
    <div>
      <div ref={scrollRef} className={cn("overflow-y-auto", moves.length > 0 && "h-60")}>
        {moves.length === 0 ? (
          <p className="px-4 py-3 text-sm text-graphite">
            Every move is written out here as you play.
          </p>
        ) : (
          <ol className="py-1">
            {moves.map((move, i) => (
              <li
                key={i}
                className="grid grid-cols-[1.5rem_0.5rem_1fr_auto] items-baseline gap-x-2 px-3 py-1"
              >
                <span className="figures text-right text-sm text-graphite">
                  {move.color === "w" ? Math.floor(i / 2) + 1 : ""}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-2 w-2 self-center border",
                    move.color === "w"
                      ? "border-frame bg-[#F7F3EA]"
                      : "border-graphite/50 bg-[#211F1C]",
                  )}
                />
                <span className="text-[15px] leading-snug">{describeMove(move)}</span>
                <span className="figures text-sm text-graphite">{move.san}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {result && (
        <div className="figures border-t border-rule px-4 py-2 text-center text-[15px] font-semibold text-brass">
          {result}
        </div>
      )}
    </div>
  )
}
