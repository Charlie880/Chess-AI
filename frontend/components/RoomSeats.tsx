"use client"

import { useState } from "react"
import { ENGINES, type Difficulty } from "@/lib/engines"
import type { RoomState } from "@/lib/room"
import { cn } from "@/lib/utils"

interface RoomSeatsProps {
  state: RoomState
  onSit: (color: "w" | "b") => void
  onSeatEngine: (color: "w" | "b", difficulty: Difficulty) => void
  onClearSeat: (color: "w" | "b") => void
}

const ORDER: ("w" | "b")[] = ["w", "b"]
const LABEL = { w: "White", b: "Black" }

export default function RoomSeats({ state, onSit, onSeatEngine, onClearSeat }: RoomSeatsProps) {
  const [engineFor, setEngineFor] = useState<"w" | "b" | null>(null)
  const gameStarted = state.moves.length > 0
  const youAreSeated = state.you.color !== null

  return (
    <div className="px-4 py-3">
      {ORDER.map((color) => {
        const seat = state.seats[color]
        return (
          <div key={color} className="flex min-h-[2.4rem] items-center gap-2 py-1">
            <span
              aria-hidden
              className={cn(
                "h-3.5 w-3.5 shrink-0 border",
                color === "w" ? "border-frame bg-[#F7F3EA]" : "border-graphite/50 bg-[#211F1C]",
              )}
            />
            <span className="w-12 shrink-0 text-sm text-graphite">{LABEL[color]}</span>

            {seat ? (
              <>
                <span className="min-w-0 flex-1 truncate text-[15px]">
                  {seat.name}
                  {seat.isYou && <span className="text-graphite"> (you)</span>}
                </span>
                {seat.kind === "engine" && !gameStarted && (
                  <button
                    type="button"
                    onClick={() => onClearSeat(color)}
                    className="shrink-0 text-sm text-graphite underline decoration-rule underline-offset-4 hover:text-chalk"
                  >
                    Remove
                  </button>
                )}
              </>
            ) : engineFor === color ? (
              <span className="flex flex-1 flex-wrap gap-1">
                {(Object.keys(ENGINES) as Difficulty[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSeatEngine(color, id)
                      setEngineFor(null)
                    }}
                    className="border border-rule px-2 py-1 text-sm text-graphite hover:border-brass hover:text-chalk"
                  >
                    {ENGINES[id].opponent}
                  </button>
                ))}
              </span>
            ) : (
              <span className="flex flex-1 gap-2">
                <button
                  type="button"
                  onClick={() => onSit(color)}
                  disabled={youAreSeated}
                  className="border border-brass/70 px-2.5 py-1 text-sm font-semibold text-brass hover:bg-brass/10 disabled:opacity-30"
                >
                  Sit here
                </button>
                <button
                  type="button"
                  onClick={() => setEngineFor(color)}
                  className="border border-rule px-2.5 py-1 text-sm text-graphite hover:border-graphite hover:text-chalk"
                >
                  Add an engine
                </button>
              </span>
            )}
          </div>
        )
      })}

      {state.watchers.length > 0 && (
        <p className="mt-2 border-t border-rule pt-2 text-sm text-graphite">
          Watching: {state.watchers.join(", ")}
        </p>
      )}
    </div>
  )
}
