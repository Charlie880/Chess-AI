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
      if (!response.ok) throw new Error(data.error ?? "Sign-in failed")
      setUsername("")
      setPassword("")
      onAuthenticated(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed")
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
      <div className="flex items-center justify-between rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2">
        <span className="text-sm">
          Signed in as <span className="font-semibold">{user.username}</span>
        </span>
        <button
          type="button"
          onClick={signOut}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-neutral-700 bg-neutral-900">
      <div className="flex border-b border-neutral-700">
        {(["login", "register"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option)
              setError(null)
            }}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider",
              mode === option ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-300",
            )}
          >
            {option === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={24}
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-40"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <p className="text-[11px] leading-snug text-neutral-500">
          Signing in saves every game and its result to your history.
        </p>
      </div>
    </form>
  )
}
