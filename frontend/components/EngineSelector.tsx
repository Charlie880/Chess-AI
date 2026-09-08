"use client"

import { ENGINES, type Difficulty } from "@/lib/engines"
import { cn } from "@/lib/utils"

interface EngineSelectorProps {
  difficulty: Difficulty
  onDifficultyChange: (difficulty: Difficulty) => void
  disabled?: boolean
}

const ORDER: Difficulty[] = ["easy", "normal", "hard"]

export default function EngineSelector({
  difficulty,
  onDifficultyChange,
  disabled,
}: EngineSelectorProps) {
  return (
    <div>
      <div className="flex" role="radiogroup" aria-label="Opponent">
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={difficulty === id}
            onClick={() => onDifficultyChange(id)}
            disabled={disabled}
            className={cn(
              "flex-1 border-b-2 px-3 py-2.5 text-[15px] transition-colors disabled:opacity-40",
              difficulty === id
                ? "border-brass font-semibold text-chalk"
                : "border-transparent text-graphite hover:text-chalk",
            )}
          >
            {ENGINES[id].label}
          </button>
        ))}
      </div>
      <p className="px-4 pb-3 pt-2 text-sm leading-snug text-graphite">
        {ENGINES[difficulty].detail}
      </p>
    </div>
  )
}
