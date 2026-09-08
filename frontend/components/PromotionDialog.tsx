"use client"

import { PIECE_GLYPHS, type PieceColor } from "@/lib/chess-ui"

interface PromotionDialogProps {
  color: PieceColor
  onSelect: (piece: "q" | "r" | "b" | "n") => void
  onCancel: () => void
}

const CHOICES: ("q" | "r" | "b" | "n")[] = ["q", "r", "b", "n"]

export default function PromotionDialog({ color, onSelect, onCancel }: PromotionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancel}
      role="dialog"
      aria-label="Choose promotion piece"
    >
      <div
        className="rounded-md border border-neutral-700 bg-neutral-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm text-neutral-400">Promote to</p>
        <div className="flex gap-2">
          {CHOICES.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className="flex h-16 w-16 items-center justify-center rounded border border-neutral-700 bg-[#eeeed2] text-4xl hover:border-neutral-400"
              style={{
                color: color === "w" ? "#fff" : "#1b1b1b",
                textShadow: color === "w" ? "0 0 1px #000, 1px 1px 0 #000, -1px -1px 0 #000" : "none",
              }}
              aria-label={piece}
            >
              {PIECE_GLYPHS[piece]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
