import Link from "next/link"

export default function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-10 items-center gap-1.5 rounded-lg border border-field bg-white px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink"
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  )
}
