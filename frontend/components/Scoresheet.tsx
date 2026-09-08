"use client"

import { useEffect, useRef } from "react"
import { describeMove, type PlayedMove } from "@/lib/chess-ui"
import { cn } from "@/lib/utils"

interface ScoresheetProps {
  moves: PlayedMove[]
  result: string | null
}

/** One row per half-move, written out in words, with the notation alongside.
 * No box: the numbers and the alignment are what identify it as a scoresheet. */
export default function Scoresheet({ moves, result }: ScoresheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [moves.length])

  return (
    <div>
      <p className="mb-3 text-sm text-graphite">
        {moves.length === 0
          ? "Every move is written out here as you play."
          : `${Math.ceil(moves.length / 2)} ${moves.length > 2 ? "moves" : "move"}`}
      </p>

      <div ref={scrollRef} className={cn("overflow-y-auto", moves.length > 0 && "max-h-[26rem]")}>
        <ol>
          {moves.map((move, i) => (
            <li
              key={i}
              className="grid grid-cols-[1.1rem_1fr_auto] items-baseline gap-x-3 py-[5px]"
            >
              <span className="figures text-right text-[13px] text-graphite">
                {move.color === "w" ? Math.floor(i / 2) + 1 : ""}
              </span>
              <span
                className={cn(
                  "text-[15px] leading-snug",
                  move.color === "w" ? "text-chalk" : "text-graphite",
                )}
              >
                {describeMove(move)}
              </span>
              <span className="figures text-[13px] text-graphite">{move.san}</span>
            </li>
          ))}
        </ol>
      </div>

      {result && (
        <p className="figures mt-3 border-t border-rule pt-3 text-[15px] font-semibold text-brass">
          {result}
        </p>
      )}
    </div>
  )
}
