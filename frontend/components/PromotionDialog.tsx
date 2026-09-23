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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a piece to promote to"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl border border-line bg-white p-5 shadow-[0_16px_40px_rgba(20,20,18,.14)]"
      >
        <p className="mb-3.5 text-center text-[13px] text-slate">
          Your pawn reaches the last rank
        </p>
        <div className="flex gap-2">
          {CHOICES.map(({ id, name }, index) => (
            <button
              key={id}
              type="button"
              autoFocus={index === 0}
              onClick={() => onSelect(id)}
              title={name}
              aria-label={name}
              className="flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-board-light text-[44px] leading-none transition-colors hover:bg-board-sel [font-family:'Segoe_UI_Symbol','DejaVu_Sans',serif]"
              style={{
                color: color === "w" ? "#ffffff" : "#1a1a1a",
                WebkitTextStroke: color === "w" ? "1.2px #1a1a1a" : "0",
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
