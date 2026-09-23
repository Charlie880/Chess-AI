import Link from "next/link"

/** The knight-in-a-crown mark plus the wordmark.
 *
 * The mark is painted as a background rather than an <img>, because the file
 * is not in the repo yet: DesignSync caps file reads at 256 KiB and the source
 * PNG is larger, so it came back without an end marker. A missing background
 * renders as nothing, where a missing <img> draws a broken-image box. Drop the
 * real file at `frontend/public/mess-mark.png` and it appears. */
export default function SiteMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Mess, home">
      <span
        aria-hidden
        className="block h-[29px] w-[38px] shrink-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/mess-mark.png')" }}
      />
      <span className="font-mark text-[18px] font-bold tracking-[0.18em]">MESS</span>
    </Link>
  )
}
