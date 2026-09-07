"use client"

import { useState } from "react"
import { Chess } from "chess.js"
import ChessBoard from "@/components/ChessBoard"
import ModeSelector from "@/components/ModeSelector"
import MoveLog from "@/components/MoveLog"
import Rules from "@/components/Rules"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

export default function ChessGame() {
  const [game, setGame] = useState(new Chess())
  const [gameHistory, setGameHistory] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal")
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  const { toast } = useToast()

  const handleNewGame = () => {
    const newGame = new Chess()
    setGame(newGame)
    setGameHistory([])
    setIsPlayerTurn(true)
    setIsAiThinking(false)
    setLastMove(null)
  }

  const getAiMove = async (currentFen: string) => {
    try {
      setIsAiThinking(true)

      const response = await fetch("/api/engine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fen: currentFen,
          difficulty: difficulty,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get AI move")
      }

      const data = await response.json()
      return data.move
    } catch (error) {
      console.error("Error getting AI move:", error)
      toast({
        title: "AI Error",
        description: "Failed to get AI move. Please try again.",
        variant: "destructive",
      })
      return null
    } finally {
      setIsAiThinking(false)
    }
  }

  const handleMove = async (from: string, to: string) => {
    if (!isPlayerTurn || isAiThinking) return false

    const gameCopy = new Chess(game.fen())

    try {
      const move = gameCopy.move({ from, to, promotion: "q" })
      if (move) {
        setGame(gameCopy)
        setGameHistory((prev) => [...prev, move.san])
        setIsPlayerTurn(false)
        setLastMove({ from, to })

        if (gameCopy.inCheck()) {
          toast({
            title: "Check!",
            description: "The king is in check!",
            variant: "default",
          })
        }

        if (gameCopy.isGameOver()) {
          if (gameCopy.isCheckmate()) {
            toast({
              title: "Checkmate!",
              description: "You won the game! 🎉",
              variant: "default",
            })
          } else if (gameCopy.isDraw()) {
            toast({
              title: "Draw",
              description: "The game ended in a draw.",
            })
          }
          return true
        }

        const aiMoveData = await getAiMove(gameCopy.fen())

        if (aiMoveData) {
          try {
            const aiMoveResult = gameCopy.move(aiMoveData)
            if (aiMoveResult) {
              setGame(new Chess(gameCopy.fen()))
              setGameHistory((prev) => [...prev, aiMoveResult.san])
              setLastMove({ from: aiMoveResult.from, to: aiMoveResult.to })

              if (gameCopy.inCheck()) {
                toast({
                  title: "Check!",
                  description: "You are in check!",
                  variant: "destructive",
                })
              }

              if (gameCopy.isGameOver()) {
                if (gameCopy.isCheckmate()) {
                  toast({
                    title: "Checkmate!",
                    description: "AI won the game! Better luck next time.",
                    variant: "destructive",
                  })
                } else if (gameCopy.isDraw()) {
                  toast({
                    title: "Draw",
                    description: "The game ended in a draw.",
                  })
                }
              }
            } else {
              throw new Error("Invalid move returned by AI")
            }
          } catch (error) {
            console.error("Invalid AI move:", aiMoveData, error)
            toast({
              title: "AI Error",
              description: "AI made an invalid move. Please start a new game.",
              variant: "destructive",
            })
          }
        }

        setIsPlayerTurn(true)
        return true
      } else {
        toast({
          title: "Invalid Move",
          description: "That move is not allowed. Please try a different move.",
          variant: "destructive",
        })
        return false
      }
    } catch (error) {
      console.error("Move error:", error)
      toast({
        title: "Move Error",
        description: "An error occurred while making the move.",
        variant: "destructive",
      })
      return false
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Chess Master</h1>
          <p className="text-muted-foreground">Play chess against AI opponents of varying difficulty</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold">Game Board</h2>
                <div className="flex items-center gap-2">
                  {isAiThinking && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      AI is thinking...
                    </div>
                  )}
                  <Button onClick={handleNewGame} variant="outline" disabled={isAiThinking}>
                    New Game
                  </Button>
                </div>
              </div>

              <div className="flex justify-center">
                <ChessBoard
                  position={game.fen()}
                  onMove={handleMove}
                  isPlayerTurn={isPlayerTurn && !isAiThinking}
                  lastMove={lastMove}
                />
              </div>

              <div className="mt-4">
                <ModeSelector
                  difficulty={difficulty}
                  onDifficultyChange={setDifficulty}
                  disabled={!isPlayerTurn || isAiThinking}
                />
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <MoveLog moves={gameHistory} />
            <Rules />
          </div>
        </div>
      </div>
    </div>
  )
}
