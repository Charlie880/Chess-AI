"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface ChessBoardProps {
  position: string
  onMove: (from: string, to: string) => boolean
  isPlayerTurn: boolean
  lastMove?: { from: string; to: string } | null
}

const PIECE_SYMBOLS: { [key: string]: string } = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"]

export default function ChessBoard({ position, onMove, isPlayerTurn, lastMove }: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [hoveredSquare, setHoveredSquare] = useState<string | null>(null)

  // Parse FEN position to get piece placement
  const parseFEN = (fen: string) => {
    const [piecePlacement] = fen.split(" ")
    const board: { [key: string]: string } = {}

    const ranks = piecePlacement.split("/")
    ranks.forEach((rank, rankIndex) => {
      let fileIndex = 0
      for (const char of rank) {
        if (isNaN(Number.parseInt(char))) {
          const square = FILES[fileIndex] + RANKS[rankIndex]
          board[square] = char
          fileIndex++
        } else {
          fileIndex += Number.parseInt(char)
        }
      }
    })

    return board
  }

  const board = parseFEN(position)

  const handleSquareClick = (square: string) => {
    if (!isPlayerTurn) return

    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    if (selectedSquare) {
      const moveSuccessful = onMove(selectedSquare, square)
      setSelectedSquare(null)
    } else if (board[square]) {
      // Only select squares with pieces
      const piece = board[square]
      const isWhitePiece = piece === piece.toUpperCase()
      // For now, assume player is always white
      if (isWhitePiece) {
        setSelectedSquare(square)
      }
    }
  }

  const isLightSquare = (file: string, rank: string) => {
    const fileIndex = FILES.indexOf(file)
    const rankIndex = RANKS.indexOf(rank)
    return (fileIndex + rankIndex) % 2 === 0
  }

  return (
    <div className="inline-block border-2 border-border rounded-lg overflow-hidden shadow-lg">
      <div className="grid grid-cols-8 gap-0">
        {RANKS.map((rank) =>
          FILES.map((file) => {
            const square = file + rank
            const piece = board[square]
            const isLight = isLightSquare(file, rank)
            const isSelected = selectedSquare === square
            const isHovered = hoveredSquare === square
            const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square)

            return (
              <div
                key={square}
                className={cn(
                  "w-16 h-16 flex items-center justify-center text-4xl cursor-pointer relative transition-all duration-200",
                  isLight ? "bg-amber-100" : "bg-amber-800",
                  isSelected && "ring-4 ring-blue-500 ring-inset",
                  isLastMoveSquare && "bg-yellow-400 bg-opacity-60",
                  isHovered && "brightness-110",
                  !isPlayerTurn && "cursor-not-allowed opacity-75",
                )}
                onClick={() => handleSquareClick(square)}
                onMouseEnter={() => setHoveredSquare(square)}
                onMouseLeave={() => setHoveredSquare(null)}
              >
                {piece && (
                  <span
                    className={cn(
                      "select-none transition-transform duration-200",
                      isSelected && "scale-110",
                      piece === piece.toUpperCase() ? "text-white drop-shadow-lg" : "text-black",
                    )}
                  >
                    {PIECE_SYMBOLS[piece]}
                  </span>
                )}

                {/* Square coordinates for debugging */}
                <span className="absolute bottom-0 right-0 text-xs opacity-30 pointer-events-none">{square}</span>
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}
