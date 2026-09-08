export type Difficulty = "easy" | "normal" | "hard"

/** What each engine actually is. The point of this app is that the three
 * opponents are different machines with different limits, so the interface
 * says what they are rather than hiding it behind Easy/Normal/Hard. */
export const ENGINES: Record<Difficulty, { label: string; opponent: string; detail: string }> = {
  easy: {
    label: "Easy",
    opponent: "Neural net",
    detail: "88,704 parameters, picks the best legal move it can see",
  },
  normal: {
    label: "Normal",
    opponent: "Minimax",
    detail: "2-ply search, counts material, finds mate in one",
  },
  hard: {
    label: "Hard",
    opponent: "Stockfish",
    detail: "depth 15, falls back to a 3-ply search when unreachable",
  },
}
