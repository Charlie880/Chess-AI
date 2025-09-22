"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

interface MoveLogProps {
  moves: string[]
}

export default function MoveLog({ moves }: MoveLogProps) {
  const movePairs = []
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || "",
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Move History</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          {movePairs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No moves yet</p>
          ) : (
            <div className="space-y-1">
              {movePairs.map((pair) => (
                <div key={pair.number} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-muted-foreground">{pair.number}.</span>
                  <span className="w-12 font-mono">{pair.white}</span>
                  {pair.black && <span className="w-12 font-mono text-muted-foreground">{pair.black}</span>}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
