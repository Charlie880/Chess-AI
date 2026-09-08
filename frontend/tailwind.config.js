/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // One accent, everything else neutral. The board used to be walnut and
        // maple with a brass accent and separate greens and reds for results -
        // three hue families competing. Now the accent is the only chroma on
        // the page, and results read by brightness.
        ink: "#0E1012", // ground
        raise: "#16191C", // the few surfaces that lift off it
        rule: "#23272B", // hairlines
        chalk: "#F0F1F2", // primary text
        graphite: "#868C92", // secondary text
        brass: "#D8A33F", // the accent, and the only chroma
        board: {
          light: "#E9E7E2", // bone
          dark: "#575D63", // graphite
        },
        alarm: "#DD6A52", // check, and anything that has gone wrong
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
