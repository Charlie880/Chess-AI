"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface ScoresheetProps {
  moves: string[]
  result: string | null
}

/** The move list identifies itself: numbered rows in two columns is what a
 * scoresheet looks like, so it needs no heading above it. */
export default function Scoresheet({ moves, result }: ScoresheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [moves.length])

  const pairs: { number: number; white: string; black: string }[] = []
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i], black: moves[i + 1] ?? "" })
  }

  return (
    <div>
      <div ref={scrollRef} className={cn("overflow-y-auto", pairs.length > 0 && "h-56")}>
        {pairs.length === 0 ? (
          <p className="px-4 py-3 text-sm text-graphite">
            The moves you play appear here in notation.
          </p>
        ) : (
          <ol className="figures px-2 py-1 text-[15px]">
            {pairs.map((pair) => (
              <li
                key={pair.number}
                className="grid grid-cols-[1.9rem_4.6rem_4.6rem] items-baseline gap-2 px-2 py-0.5"
              >
                <span className="text-right text-sm text-graphite">{pair.number}</span>
                <span className="font-medium">{pair.white}</span>
                <span className={cn("font-medium", !pair.black && "text-graphite")}>
                  {pair.black || "…"}
                </span>
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
