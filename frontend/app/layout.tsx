import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Chess AI",
  description: "Play chess against a CNN, a minimax search, or Stockfish.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 antialiased">{children}</body>
    </html>
  )
}
