/* Smallest check that fails if move descriptions go wrong.
   Run: node --experimental-strip-types lib/chess-ui.test.mts */

import assert from "node:assert/strict"
import { Chess } from "chess.js"
import { describeMove, type PlayedMove } from "./chess-ui.ts"

/** Play a line and describe its last move. */
function lastDescription(sanMoves: string[]): string {
  const game = new Chess()
  for (const san of sanMoves) game.move(san)
  const history = game.history({ verbose: true }) as unknown as PlayedMove[]
  return describeMove(history[history.length - 1])
}

const cases: [string, string[], string][] = [
  ["quiet move", ["e4"], "Pawn e2 to e4"],
  ["knight out", ["e4", "e5", "Nf3"], "Knight g1 to f3"],
  ["pawn takes pawn", ["e4", "d5", "exd5"], "Pawn e4 takes pawn d5"],
  [
    "piece takes piece",
    ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6"],
    "Bishop b5 takes knight c6",
  ],
  ["kingside castle", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"], "Castles kingside"],
  [
    "queenside castle",
    ["d4", "d5", "Nc3", "Nc6", "Bf4", "Bf5", "Qd2", "Qd7", "O-O-O"],
    "Castles queenside",
  ],
  ["check, not mate", ["e4", "e5", "Bc4", "d6", "Qf3", "Nc6", "Bxf7+"], "Bishop c4 takes pawn f7, check"],
  ["checkmate", ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7"], "Queen h5 takes pawn f7, checkmate"],
  ["en passant", ["e4", "a6", "e5", "d5", "exd6"], "Pawn e5 takes pawn d6 en passant"],
]

for (const [name, line, expected] of cases) {
  const actual = lastDescription(line)
  assert.equal(actual, expected, `${name}: got "${actual}"`)
  console.log(`${name}: ${actual}`)
}

// Promotion needs a constructed position rather than a long opening.
function describeFrom(fen: string, move: { from: string; to: string; promotion?: string }) {
  const game = new Chess(fen)
  game.move(move)
  return describeMove((game.history({ verbose: true }) as unknown as PlayedMove[])[0])
}

const promotion = describeFrom("8/P6k/8/8/8/8/8/7K w - - 0 1", {
  from: "a7",
  to: "a8",
  promotion: "r",
})
assert.equal(promotion, "Pawn a7 to a8, promotes to rook")
console.log(`promotion: ${promotion}`)

// A capture and a promotion on the same move: both halves must be narrated.
const capturePromotion = describeFrom("r6k/1P6/8/8/8/8/8/7K w - - 0 1", {
  from: "b7",
  to: "a8",
  promotion: "q",
})
assert.equal(capturePromotion, "Pawn b7 takes rook a8, promotes to queen, check")
console.log(`capture-promotion: ${capturePromotion}`)

console.log("all ok")
