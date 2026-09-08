"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface MoveLogProps {
  moves: string[]
  result: string | null
}

export default function MoveLog({ moves, result }: MoveLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Keep the latest move in view the way a real scoresheet scrolls.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [moves.length])

  const pairs: { number: number; white: string; black: string }[] = []
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i], black: moves[i + 1] ?? "" })
  }

  return (
    <div className="flex flex-col rounded-md border border-neutral-700 bg-neutral-900">
      <div className="border-b border-neutral-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Moves
      </div>
      <div ref={scrollRef} className="h-64 overflow-y-auto">
        {pairs.length === 0 ? (
          <p className="p-3 text-sm text-neutral-500">No moves yet.</p>
        ) : (
          <table className="w-full font-mono text-sm">
            <tbody>
              {pairs.map((pair, i) => (
                <tr key={pair.number} className={cn(i % 2 === 1 && "bg-neutral-800/40")}>
                  <td className="w-10 px-2 py-1 text-right text-neutral-500">{pair.number}.</td>
                  <td className="px-2 py-1 text-neutral-100">{pair.white}</td>
                  <td className="px-2 py-1 text-neutral-100">{pair.black}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {result && (
        <div className="border-t border-neutral-700 px-3 py-2 text-center font-mono text-sm text-neutral-300">
          {result}
        </div>
      )}
    </div>
  )
}
