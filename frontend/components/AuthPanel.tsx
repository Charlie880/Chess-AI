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

/** One link in the header. The form only appears when someone asks for it. */
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
      {user?.kind === "user" ? (
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
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold transition-colors hover:text-goldink"
        >
          Sign in
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Sign in"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-[0_16px_40px_rgba(20,20,18,.14)]"
          >
            <div className="flex gap-1 rounded-lg bg-chip p-1">
              {(["login", "register"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMode(option)
                    setError(null)
                  }}
                  className={cn(
                    "flex-1 rounded-md py-2 text-[13px] font-bold transition-colors",
                    mode === option ? "bg-white text-ink shadow-pill" : "text-mute hover:text-ink",
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
                className="h-11 rounded-lg border border-field bg-white px-3 text-[14px] placeholder:text-mute focus:border-gold"
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
                className="h-11 rounded-lg border border-field bg-white px-3 text-[14px] placeholder:text-mute focus:border-gold"
              />

              {error && <p className="text-[13px] text-alarm">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="h-11 rounded-lg bg-ink text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b] disabled:opacity-40"
              >
                {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
              </button>

              <p className="text-[13px] leading-[1.5] text-slate">
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
