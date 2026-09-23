"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import AuthShell from "@/components/AuthShell"
import { cn } from "@/lib/utils"

const INPUT =
  "h-[46px] w-full rounded-lg border border-field bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-mute focus:border-gold focus:shadow-[0_0_0_3px_rgba(184,150,62,.15)]"

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function SignInPage() {
  const router = useRouter()
  const [show, setShow] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "That did not work. Try again.")
      router.push("/play")
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.")
      setBusy(false)
    }
  }

  return (
    <AuthShell
      tile={112}
      width={400}
      markWidth={76}
      markType={17}
      titleSize={34}
      title="Welcome Back"
      subtitle="Enter the arena and make your move."
    >
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          aria-label="Username"
          autoComplete="username"
          required
          className={INPUT}
        />

        <div className="relative">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            required
            className={cn(INPUT, "pr-[46px]")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className={cn(
              "absolute right-1 top-1 flex h-[38px] w-[38px] items-center justify-center transition-colors",
              show ? "text-gold" : "text-mute",
            )}
          >
            <EyeIcon />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setNote(true)}
          className="-mt-0.5 self-end text-xs font-semibold text-slate transition-colors hover:text-goldink"
        >
          Forgot password?
        </button>
        {note && (
          <p className="-mt-1 self-end text-xs text-mute">
            Password reset is not set up yet.
          </p>
        )}

        {error && <p className="text-[13px] text-alarm">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1.5 h-12 rounded-lg bg-ink text-[13px] font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b] disabled:opacity-40"
        >
          SIGN IN
        </button>
      </form>

      <div className="my-4 flex w-full items-center gap-3 text-[11px] tracking-[0.12em] text-mute">
        <div className="h-px flex-1 bg-line" />
        OR
        <div className="h-px flex-1 bg-line" />
      </div>

      {/* A guest identity is minted on arrival, so this needs no account and
          the games still belong to somebody. */}
      <Link
        href="/play"
        className="flex h-12 w-full items-center justify-center rounded-lg border border-ink bg-white text-[13px] font-bold tracking-[0.12em] text-ink transition-colors hover:bg-paper"
      >
        PLAY AS GUEST
      </Link>

      <p className="mt-6 text-[13px] text-slate">
        New to Mess?{" "}
        <Link href="/register" className="font-bold text-ink hover:text-goldink">
          Create an account.
        </Link>
      </p>
    </AuthShell>
  )
}
