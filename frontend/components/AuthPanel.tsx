"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

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
  onAuthenticated: (user: User) => void
  onSignedOut: () => void
}

/** Sits in the top bar as a name and one link. The form only appears when
 * someone asks for it, rather than occupying a panel beside every game. */
export default function AuthPanel({ user, onAuthenticated, onSignedOut }: AuthPanelProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "That did not work. Try again.")
      setUsername("")
      setPassword("")
      setOpen(false)
      onAuthenticated(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    onSignedOut()
  }

  return (
    <>
      <span className="flex items-center gap-4 text-sm text-graphite">
        <span className="hidden max-w-[10rem] truncate sm:inline">{user?.username ?? "…"}</span>
        {user?.kind === "user" ? (
          <button type="button" onClick={signOut} className="transition-colors hover:text-chalk">
            Sign out
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="transition-colors hover:text-chalk"
          >
            Sign in
          </button>
        )}
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Sign in"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm border border-rule bg-raise p-6"
          >
            <div className="flex gap-6">
              {(["login", "register"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMode(option)
                    setError(null)
                  }}
                  className={cn(
                    "border-b-2 pb-1.5 text-[15px] transition-colors",
                    mode === option
                      ? "border-brass font-semibold text-chalk"
                      : "border-transparent text-graphite hover:text-chalk",
                  )}
                >
                  {option === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                aria-label="Username"
                autoComplete="username"
                autoFocus
                required
                minLength={3}
                maxLength={24}
                className="h-11 border border-rule bg-ink px-3 text-[15px] placeholder:text-graphite/70 focus:border-brass"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Password"
                aria-label="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                className="h-11 border border-rule bg-ink px-3 text-[15px] placeholder:text-graphite/70 focus:border-brass"
              />

              {error && <p className="text-sm text-alarm">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="h-11 bg-brass text-[15px] font-semibold text-ink transition-colors hover:bg-[#E6B75C] disabled:opacity-40"
              >
                {mode === "login" ? "Sign in" : "Create account"}
              </button>

              <p className="text-sm leading-relaxed text-graphite">
                {user
                  ? `Playing as ${user.username}. Your games are already saved to this browser; an account carries them to your other devices.`
                  : "An account carries your games across devices."}
              </p>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
