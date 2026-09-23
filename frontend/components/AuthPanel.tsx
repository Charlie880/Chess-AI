"use client"

import Link from "next/link"

// Everyone has one of these. A guest identity lives in a long-lived cookie,
// so their games are recorded and their history is theirs; signing in is how
// you carry that across browsers rather than how you start being counted.
export type User = {
  kind: "user" | "guest"
  id: string
  username: string
  createdAt?: string
}

interface AuthPanelProps {
  user: User | null
  onSignedOut: () => void
}

/** The header's account corner. Signing in has its own screen now, so this is
 * a link rather than a dialog. */
export default function AuthPanel({ user, onSignedOut }: AuthPanelProps) {
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    onSignedOut()
  }

  if (user?.kind === "user") {
    return (
      <span className="flex items-center gap-4 text-sm">
        <span className="hidden max-w-[10rem] truncate font-semibold sm:inline">
          {user.username}
        </span>
        <button
          type="button"
          onClick={signOut}
          className="font-semibold text-slate transition-colors hover:text-goldink"
        >
          Sign out
        </button>
      </span>
    )
  }

  return (
    <Link href="/signin" className="text-sm font-semibold transition-colors hover:text-goldink">
      Sign in
    </Link>
  )
}
