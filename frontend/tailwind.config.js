/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // A dark hall, a wooden board, brass fittings. The board is the only
        // warm object on the page and everything else stays out of its way.
        ink: "#131A1C", // ground: blue-green black, not a tinted grey
        slate: "#1B2427", // raised surfaces
        rule: "#2A3538", // hairlines
        chalk: "#E8E4D9", // primary text
        graphite: "#8A9698", // secondary text
        brass: "#C9963F", // the single accent
        walnut: "#7A5A3C", // dark squares
        maple: "#DFC9A3", // light squares
        frame: "#40301F", // board surround
        etch: "#4E3823", // coordinates on light squares
        // Two reds, because the same hue cannot do both jobs: the deep one
        // is a fill on wood, the light one is text on the dark panel and
        // needs 4.5:1 against it.
        brick: "#A83E2E", // check square, on the board
        alarm: "#DD6A52", // loss and error text, on the panel
        moss: "#7FA05A", // wins
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
      },
      keyframes: {
        // The arriving piece settles rather than teleporting. The only motion
        // on the page, and it answers an action the player just took.
        settle: {
          "0%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        settle: "settle 160ms cubic-bezier(.2,.8,.3,1)",
      },
    },
  },
  plugins: [],
}
