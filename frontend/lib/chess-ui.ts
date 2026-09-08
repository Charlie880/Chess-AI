/** Shared piece rendering + material helpers. */

// The *solid* glyph block (U+265A-F) for both colours. The outline block
// (U+2654-9) renders inconsistently across platforms - on Windows the white
// pieces come out as hollow line art that all but disappears on a light square.
// Drawing both sides from the solid set and colouring them is what every
// browser chess UI ends up doing.
//
// U+FE0E is the text-presentation selector, and it is load-bearing: without it
// Segoe UI Emoji claims these codepoints and paints fixed-colour 3D pieces, so
// both sides come out identical purple and `color` is ignored entirely.
const TEXT = "︎"

export const PIECE_GLYPHS: Record<string, string> = {
  k: "♚" + TEXT,
  q: "♛" + TEXT,
  r: "♜" + TEXT,
  b: "♝" + TEXT,
  n: "♞" + TEXT,
  p: "♟" + TEXT,
}

export const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const

export type Square = string
export type PieceColor = "w" | "b"

/** Captured material for each side, plus who is up and by how much. */
export function materialBalance(captured: { w: string[]; b: string[] }) {
  const sum = (pieces: string[]) => pieces.reduce((n, p) => n + (PIECE_VALUES[p] ?? 0), 0)
  // captured.w = white pieces that black has taken.
  const diff = sum(captured.b) - sum(captured.w)
  return { advantage: Math.abs(diff), leader: diff === 0 ? null : diff > 0 ? "w" : "b" }
}

export const PIECE_NAMES: Record<string, string> = {
  k: "King",
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
}

/** The shape chess.js returns from `history({ verbose: true })`. */
export type PlayedMove = {
  color: PieceColor
  from: string
  to: string
  piece: string
  captured?: string
  promotion?: string
  flags: string
  san: string
}

/** Turn a move into a sentence. Notation is precise but has to be learned;
 * this says the same thing in words, keeping both squares so it still pins
 * down exactly which piece moved. */
export function describeMove(move: PlayedMove): string {
  // chess.js flags: k/q castling, e en passant, p promotion, c capture.
  if (move.flags.includes("k")) return withCheck("Castles kingside", move.san)
  if (move.flags.includes("q")) return withCheck("Castles queenside", move.san)

  const mover = PIECE_NAMES[move.piece]

  // A capture and a promotion can happen on the same move (bxa8=Q), so this
  // builds one sentence rather than returning on whichever it checks first.
  let sentence: string
  if (move.captured) {
    const victim = PIECE_NAMES[move.captured].toLowerCase()
    const passing = move.flags.includes("e") ? " en passant" : ""
    sentence = `${mover} ${move.from} takes ${victim} ${move.to}${passing}`
  } else {
    sentence = `${mover} ${move.from} to ${move.to}`
  }

  if (move.promotion) {
    sentence += `, promotes to ${PIECE_NAMES[move.promotion].toLowerCase()}`
  }

  return withCheck(sentence, move.san)
}

function withCheck(sentence: string, san: string): string {
  if (san.endsWith("#")) return `${sentence}, checkmate`
  if (san.endsWith("+")) return `${sentence}, check`
  return sentence
}
