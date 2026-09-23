"use client"

import { ENGINES, type Difficulty } from "@/lib/engines"
import { cn } from "@/lib/utils"

interface EngineSelectorProps {
  difficulty: Difficulty
  onDifficultyChange: (difficulty: Difficulty) => void
  disabled?: boolean
}

const ORDER: Difficulty[] = ["easy", "normal", "hard"]

/** The segmented control in the header. Choosing an opponent is a global
 * control, so it sits with the rest of them rather than beside the board. */
export default function EngineSelector({
  difficulty,
  onDifficultyChange,
  disabled,
}: EngineSelectorProps) {
  return (
    <nav
      className="flex gap-1 rounded-[10px] bg-chip p-1"
      role="radiogroup"
      aria-label="Opponent"
    >
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
            "rounded-[7px] px-[18px] py-2 text-[13px] font-bold tracking-[0.06em] transition-colors disabled:opacity-50",
            difficulty === id ? "bg-white text-ink shadow-pill" : "text-mute hover:text-ink",
          )}
        >
          {ENGINES[id].label}
        </button>
      ))}
    </nav>
  )
}
