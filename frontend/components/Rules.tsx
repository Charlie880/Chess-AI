"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

export default function Rules() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-lg flex items-center justify-between">
              Chess Rules & Info
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">How to Play</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Click a piece to select it</li>
                <li>• Click a destination square to move</li>
                <li>• Invalid moves will be highlighted</li>
                <li>• The AI will respond automatically</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Special Rules</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Castling: King and rook move together</li>
                <li>• En passant: Special pawn capture</li>
                <li>• Promotion: Pawns become queens at the end</li>
                <li>• Check: King must be protected</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">About This Project</h4>
              <p className="text-sm text-muted-foreground">
                A full-stack chess application built with React, Next.js, and FastAPI. Features three AI difficulty
                levels powered by different engines.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
