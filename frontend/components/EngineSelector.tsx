"use client"

import { ENGINES, type Difficulty } from "@/lib/engines"
import { cn } from "@/lib/utils"

interface EngineSelectorProps {
  difficulty: Difficulty
  onDifficultyChange: (difficulty: Difficulty) => void
  disabled?: boolean
}

const ORDER: Difficulty[] = ["easy", "normal", "hard"]

/** Lives in the top bar now. Choosing an opponent is a global control, not
 * something that belongs stacked in a column beside the board. */
export default function EngineSelector({
  difficulty,
  onDifficultyChange,
  disabled,
}: EngineSelectorProps) {
  return (
    <div className="flex gap-6" role="radiogroup" aria-label="Opponent">
      {ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={difficulty === id}
          onClick={() => onDifficultyChange(id)}
          disabled={disabled}
          title={ENGINES[id].detail}
          className={cn(
            "border-b-2 px-0.5 py-1 text-[15px] transition-colors disabled:opacity-40",
            difficulty === id
              ? "border-brass font-semibold text-chalk"
              : "border-transparent text-graphite hover:text-chalk",
          )}
        >
          {ENGINES[id].label}
        </button>
      ))}
    </div>
  )
}
