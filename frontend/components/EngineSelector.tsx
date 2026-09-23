"use client"

import { ENGINES, type Difficulty } from "@/lib/engines"
import { cn } from "@/lib/utils"

interface EngineSelectorProps {
  difficulty: Difficulty
  onDifficultyChange: (difficulty: Difficulty) => void
  disabled?: boolean
  /** Why it is disabled. A greyed-out control with no explanation reads as a
   * bug, so the reason rides along as a tooltip. */
  lockedReason?: string
}

const ORDER: Difficulty[] = ["easy", "normal", "hard"]

/** The segmented control in the header. Choosing an opponent is a global
 * control, so it sits with the rest of them rather than beside the board. */
export default function EngineSelector({
  difficulty,
  onDifficultyChange,
  disabled,
  lockedReason,
}: EngineSelectorProps) {
  return (
    <nav
      className="flex gap-1 rounded-[10px] bg-chip p-1"
      role="radiogroup"
      aria-label="Opponent"
      title={disabled ? lockedReason : undefined}
    >
      {ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={difficulty === id}
          onClick={() => onDifficultyChange(id)}
          disabled={disabled}
          title={disabled ? lockedReason : ENGINES[id].detail}
          className={cn(
            "rounded-[7px] px-[18px] py-2 text-[13px] font-bold tracking-[0.06em] transition-colors",
            disabled && "cursor-not-allowed",
            difficulty === id
              ? "bg-white text-ink shadow-pill"
              : cn("text-mute", disabled ? "opacity-50" : "hover:text-ink"),
          )}
        >
          {ENGINES[id].label}
        </button>
      ))}
    </nav>
  )
}
