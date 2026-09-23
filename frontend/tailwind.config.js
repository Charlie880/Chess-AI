/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Values lifted from "Mess Game.dc.html" rather than eyeballed.
      colors: {
        paper: "#f6f6f4", // page ground
        card: "#ffffff", // panels
        line: "#e6e6e1", // hairline
        divider: "#eeeeea", // hairline inside a panel
        field: "#d6d6d1", // input and quiet-button borders
        chip: "#f1f1ee", // segmented-control track
        ink: "#1a1a1a", // primary text, and the one black button
        slate: "#55554f", // secondary text
        mute: "#8b8b86", // eyebrows and metadata
        coord: "#4a453b", // board coordinates, dark enough for both square tones
        idle: "#e0e0db", // the turn dot when it is not your turn
        gold: "#b8963e", // accent line and active dot
        goldink: "#7a5f1e", // accent text
        goldwash: "#fbf7ec", // accent surface
        goldwarm: "#f5ecd4", // accent surface, hovered
        glyphchip: "#f1efe8", // the piece tile in the move list
        board: {
          light: "#f4f1ea",
          dark: "#cfc6b3",
          sel: "#e6cf8e",
          "last-light": "#efe2b8",
          "last-dark": "#d8bf7c",
          edge: "#d6d1c4",
        },
        alarm: {
          DEFAULT: "#9a3a2e",
          surface: "#fbf1ef",
          line: "#efd3cd",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "serif"],
        mark: ["var(--font-cinzel)", "Georgia", "serif"],
      },
      boxShadow: {
        board: "0 0 0 1px #d6d1c4, 0 16px 40px rgba(20,20,18,.10)",
        pill: "0 1px 3px rgba(20,20,18,.12)",
      },
      keyframes: {
        settle: { "0%": { transform: "scale(1.14)" }, "100%": { transform: "scale(1)" } },
      },
      animation: { settle: "settle 160ms cubic-bezier(.2,.8,.3,1)" },
    },
  },
  plugins: [],
}
