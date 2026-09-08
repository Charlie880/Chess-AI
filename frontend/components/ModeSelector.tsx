"use client"

import { cn } from "@/lib/utils"

export type Difficulty = "easy" | "normal" | "hard"

interface ModeSelectorProps {
  difficulty: Difficulty
  onDifficultyChange: (difficulty: Difficulty) => void
  disabled?: boolean
}

const LEVELS: { id: Difficulty; label: string; engine: string }[] = [
  { id: "easy", label: "Easy", engine: "CNN" },
  { id: "normal", label: "Normal", engine: "Minimax d2" },
  { id: "hard", label: "Hard", engine: "Stockfish" },
]

export default function ModeSelector({ difficulty, onDifficultyChange, disabled }: ModeSelectorProps) {
  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-900">
      <div className="border-b border-neutral-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Engine
      </div>
      <div className="flex p-2">
        {LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            onClick={() => onDifficultyChange(level.id)}
            disabled={disabled}
            className={cn(
              "flex-1 rounded px-2 py-2 text-sm transition-colors disabled:opacity-40",
              difficulty === level.id
                ? "bg-neutral-100 font-semibold text-neutral-900"
                : "text-neutral-300 hover:bg-neutral-800",
            )}
          >
            <span className="block">{level.label}</span>
            <span
              className={cn(
                "block text-[10px]",
                difficulty === level.id ? "text-neutral-600" : "text-neutral-500",
              )}
            >
              {level.engine}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
