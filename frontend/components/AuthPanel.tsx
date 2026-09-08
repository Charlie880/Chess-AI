"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export type User = { id: string; username: string; createdAt: string }

interface AuthPanelProps {
  user: User | null
  onAuthenticated: (user: User) => void
  onSignedOut: () => void
}

export default function AuthPanel({ user, onAuthenticated, onSignedOut }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  if (user) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="truncate text-sm text-graphite">
          Saving games for <span className="font-semibold text-chalk">{user.username}</span>
        </span>
        <button
          type="button"
          onClick={signOut}
          className="shrink-0 text-sm text-graphite underline decoration-rule underline-offset-4 hover:text-chalk hover:decoration-brass"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <div className="flex">
        {(["login", "register"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option)
              setError(null)
            }}
            className={cn(
              "flex-1 border-b-2 px-3 py-2.5 text-[15px] transition-colors",
              mode === option
                ? "border-brass font-semibold text-chalk"
                : "border-transparent text-graphite hover:text-chalk",
            )}
          >
            {option === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          aria-label="Username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={24}
          className="border border-rule bg-ink px-3 py-2 text-[15px] placeholder:text-graphite/70 focus:border-brass"
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
          className="border border-rule bg-ink px-3 py-2 text-[15px] placeholder:text-graphite/70 focus:border-brass"
        />

        {error && <p className="text-sm text-alarm">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="border border-brass/70 px-3 py-2 text-[15px] font-semibold text-brass transition-colors hover:border-brass hover:bg-brass/10 disabled:opacity-40"
        >
          {mode === "login" ? "Sign in" : "Create account"}
        </button>

        <p className="text-sm leading-snug text-graphite">
          {mode === "login"
            ? "Sign in to keep a record of every game you play."
            : "Your games and results are saved to this account."}
        </p>
      </div>
    </form>
  )
}
