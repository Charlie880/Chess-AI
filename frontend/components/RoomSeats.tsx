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
    <div>
      {ORDER.map((color) => {
        const seat = state.seats[color]
        return (
          <div
            key={color}
            className="flex min-h-[2.75rem] items-center gap-2.5 border-t border-rule py-2"
          >
            <span
              aria-hidden
              className={cn(
                "h-3 w-3 shrink-0 shadow-[0_0_0_1px_#23272B]",
                color === "w" ? "bg-[#FAF9F7]" : "bg-[#1A1C1E]",
              )}
            />
            <span className="w-10 shrink-0 text-sm text-graphite">{LABEL[color]}</span>

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
                    className="shrink-0 text-sm text-graphite transition-colors hover:text-chalk"
                  >
                    Remove
                  </button>
                )}
              </>
            ) : engineFor === color ? (
              <span className="flex flex-1 flex-wrap gap-4">
                {(Object.keys(ENGINES) as Difficulty[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSeatEngine(color, id)
                      setEngineFor(null)
                    }}
                    className="text-sm text-graphite transition-colors hover:text-chalk"
                  >
                    {ENGINES[id].opponent}
                  </button>
                ))}
              </span>
            ) : (
              <span className="flex flex-1 gap-4">
                <button
                  type="button"
                  onClick={() => onSit(color)}
                  disabled={youAreSeated}
                  className="text-[15px] font-semibold text-brass transition-colors hover:text-[#E6B75C] disabled:opacity-30"
                >
                  Sit here
                </button>
                <button
                  type="button"
                  onClick={() => setEngineFor(color)}
                  className="text-[15px] text-graphite transition-colors hover:text-chalk"
                >
                  Add an engine
                </button>
              </span>
            )}
          </div>
        )
      })}

      {state.watchers.length > 0 && (
        <p className="mt-3.5 text-sm text-graphite">
          {state.watchers.join(", ")} {state.watchers.length === 1 ? "is" : "are"} watching
        </p>
      )}
    </div>
  )
}
