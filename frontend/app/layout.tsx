import type { Metadata } from "next"
import { Archivo } from "next/font/google"
import "./globals.css"

// One family, loaded with its width axis so the same face can be expanded for
// the display line and condensed for board coordinates.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Chess AI",
  description: "Play chess against a CNN, a minimax search, or Stockfish.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
