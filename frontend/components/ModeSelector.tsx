"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ModeSelectorProps {
  difficulty: "easy" | "normal" | "hard"
  onDifficultyChange: (difficulty: "easy" | "normal" | "hard") => void
  disabled?: boolean
}

const DIFFICULTY_INFO = {
  easy: { label: "Easy", description: "CNN Engine - Good for beginners", color: "bg-green-500" },
  normal: { label: "Normal", description: "MinMax Engine - Balanced gameplay", color: "bg-yellow-500" },
  hard: { label: "Hard", description: "Stockfish Engine - Master level", color: "bg-red-500" },
}

export default function ModeSelector({ difficulty, onDifficultyChange, disabled }: ModeSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Difficulty Level</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {(Object.keys(DIFFICULTY_INFO) as Array<keyof typeof DIFFICULTY_INFO>).map((level) => {
            const info = DIFFICULTY_INFO[level]
            const isSelected = difficulty === level

            return (
              <Button
                key={level}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => onDifficultyChange(level)}
                disabled={disabled}
                className="flex-1"
              >
                <div className={`w-2 h-2 rounded-full mr-2 ${info.color}`} />
                {info.label}
              </Button>
            )
          })}
        </div>

        <p className="text-sm text-muted-foreground mt-2">{DIFFICULTY_INFO[difficulty].description}</p>
      </CardContent>
    </Card>
  )
}
