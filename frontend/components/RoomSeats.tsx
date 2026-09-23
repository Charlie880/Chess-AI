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
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-[18px]">
      {ORDER.map((color, index) => {
        const seat = state.seats[color]
        return (
          <div key={color} className="flex flex-col gap-3">
            {index > 0 && <div className="h-px bg-divider" />}
            <div className="flex min-h-[28px] items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "h-3 w-3 shrink-0 rounded-sm shadow-[0_0_0_1px_#d6d1c4]",
                  color === "w" ? "bg-white" : "bg-ink",
                )}
              />
              <span className="w-10 shrink-0 text-[13px] text-slate">{LABEL[color]}</span>

              {seat ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {seat.name}
                    {seat.isYou && <span className="font-normal text-mute"> (you)</span>}
                  </span>
                  {seat.kind === "engine" && !gameStarted && (
                    <button
                      type="button"
                      onClick={() => onClearSeat(color)}
                      className="shrink-0 text-[13px] text-mute transition-colors hover:text-ink"
                    >
                      Remove
                    </button>
                  )}
                </>
              ) : engineFor === color ? (
                <span className="flex flex-1 flex-wrap gap-3">
                  {(Object.keys(ENGINES) as Difficulty[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onSeatEngine(color, id)
                        setEngineFor(null)
                      }}
                      className="text-[13px] text-slate transition-colors hover:text-ink"
                    >
                      {ENGINES[id].opponent}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="flex flex-1 gap-3">
                  <button
                    type="button"
                    onClick={() => onSit(color)}
                    disabled={youAreSeated}
                    className="text-[13px] font-bold text-goldink transition-colors hover:text-ink disabled:opacity-40"
                  >
                    Sit here
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngineFor(color)}
                    className="text-[13px] text-mute transition-colors hover:text-ink"
                  >
                    Add an engine
                  </button>
                </span>
              )}
            </div>
          </div>
        )
      })}

      {state.watchers.length > 0 && (
        <p className="border-t border-divider pt-3 text-[13px] text-mute">
          {state.watchers.join(", ")} {state.watchers.length === 1 ? "is" : "are"} watching
        </p>
      )}
    </div>
  )
}
