import Link from "next/link"

/** The splash. One brand card on white, and the whole thing is the link into
 * the app - exactly as drawn in "Mess Splash.dc.html". */
export default function SplashPage() {
  return (
    <Link
      href="/signin"
      aria-label="Enter Mess"
      className="flex min-h-screen flex-col items-center justify-center gap-7 bg-white"
    >
      <span
        aria-hidden
        className="block bg-contain bg-center bg-no-repeat [mix-blend-mode:multiply]"
        style={{
          backgroundImage: "url('/mess-mark.png')",
          width: "min(300px, 52vw)",
          // The mark is 680x528; hold its ratio so the box does not collapse
          // while the file is missing.
          aspectRatio: "680 / 528",
        }}
      />
      <span
        className="font-mark font-bold leading-none tracking-[0.14em] text-ink"
        style={{ fontSize: "clamp(48px, 9vw, 88px)", paddingLeft: "0.14em" }}
      >
        MESS
      </span>
    </Link>
  )
}
