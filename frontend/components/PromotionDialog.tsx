"use client"

import { useEffect } from "react"
import { PIECE_GLYPHS, type PieceColor } from "@/lib/chess-ui"

interface PromotionDialogProps {
  color: PieceColor
  onSelect: (piece: "q" | "r" | "b" | "n") => void
  onCancel: () => void
}

const CHOICES: { id: "q" | "r" | "b" | "n"; name: string }[] = [
  { id: "q", name: "Queen" },
  { id: "r", name: "Rook" },
  { id: "b", name: "Bishop" },
  { id: "n", name: "Knight" },
]

export default function PromotionDialog({ color, onSelect, onCancel }: PromotionDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a piece to promote to"
    >
      <div onClick={(e) => e.stopPropagation()} className="text-center">
        <p className="mb-4 text-[15px] text-graphite">Your pawn reaches the last rank</p>
        <div className="flex gap-px">
          {CHOICES.map(({ id, name }, index) => (
            <button
              key={id}
              type="button"
              autoFocus={index === 0}
              onClick={() => onSelect(id)}
              title={name}
              aria-label={name}
              className="flex h-20 w-20 items-center justify-center bg-board-light text-5xl transition-colors hover:bg-white"
              style={{
                color: color === "w" ? "#FAF9F7" : "#1A1C1E",
                textShadow:
                  color === "w" ? "0 0 1px rgba(26,28,30,.9), 1px 1px 0 rgba(26,28,30,.55)" : "none",
              }}
            >
              {PIECE_GLYPHS[id]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
