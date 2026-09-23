import Link from "next/link"

interface AuthShellProps {
  /** The checkerboard behind the card: 112px on sign in, 56px on register. */
  tile: number
  /** Card width: 400 on sign in, 420 on register. */
  width: number
  /** Mark size above the wordmark, and the wordmark's own size. */
  markWidth: number
  markType: number
  title: string
  subtitle: string
  titleSize: number
  children: React.ReactNode
}

/** The frame both auth screens share: a checkerboard ground, a white card, the
 * mark, and a Playfair heading. */
export default function AuthShell({
  tile,
  width,
  markWidth,
  markType,
  title,
  subtitle,
  titleSize,
  children,
}: AuthShellProps) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{
        backgroundColor: "#f6f6f4",
        backgroundImage: "repeating-conic-gradient(#ececea 0 25%, transparent 0 50%)",
        backgroundSize: `${tile}px ${tile}px`,
      }}
    >
      <div
        className="flex w-full flex-col items-center rounded-[14px] bg-white shadow-[0_1px_2px_rgba(20,20,18,.06),0_16px_40px_rgba(20,20,18,.08)]"
        style={{ maxWidth: width, padding: "32px clamp(20px, 6vw, 36px) 26px" }}
      >
        <Link href="/" className="flex flex-col items-center gap-2" aria-label="Mess, home">
          <span
            aria-hidden
            className="block bg-contain bg-center bg-no-repeat"
            style={{
              backgroundImage: "url('/mess-mark.png')",
              width: markWidth,
              aspectRatio: "680 / 528",
            }}
          />
          <span
            className="font-mark font-bold tracking-[0.18em] text-ink"
            style={{ fontSize: markType, paddingLeft: "0.18em" }}
          >
            MESS
          </span>
        </Link>

        <h1
          className="mt-5 font-display font-medium tracking-[-0.01em]"
          style={{ fontSize: titleSize }}
        >
          {title}
        </h1>
        <p className="mb-6 mt-1.5 text-center text-sm text-slate">{subtitle}</p>

        {children}
      </div>
    </div>
  )
}
