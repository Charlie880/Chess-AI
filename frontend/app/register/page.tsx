"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import AuthShell from "@/components/AuthShell"
import { cn } from "@/lib/utils"

const INPUT =
  "h-[46px] w-full rounded-lg border bg-white pl-10 pr-3.5 text-sm text-ink outline-none transition placeholder:text-mute focus:border-gold focus:shadow-[0_0_0_3px_rgba(184,150,62,.15)]"

const ICON = "pointer-events-none absolute left-3.5 top-[15px] text-mute"

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={ICON}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={ICON}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={ICON}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const [show, setShow] = useState(false)
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The meter and the two dots read the same rules the backend enforces, so
  // nothing here promises a password the server would then reject.
  const longEnough = password.length >= 8
  const mixed = /[a-z]/i.test(password) && /\d/.test(password)
  const strong = password.length >= 12 && /[^a-z0-9]/i.test(password)
  const score = password ? (longEnough ? 1 : 0) + (mixed ? 1 : 0) + (strong ? 1 : 0) || 1 : 0
  const tone = ["bg-line", "bg-[#c9a24c]", "bg-gold", "bg-ink"][score]
  const mismatch = confirm.length > 0 && confirm !== password

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (mismatch) {
      setError("Those passwords do not match.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email: email || null }),
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
      tile={56}
      width={420}
      markWidth={64}
      markType={15}
      titleSize={30}
      title="Create Your Account"
      subtitle="Join the arena and begin your journey."
    >
      <form onSubmit={submit} className="flex w-full flex-col gap-2.5">
        <label className="relative block">
          <MailIcon />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Enter your email"
            aria-label="Email"
            autoComplete="email"
            className={cn(INPUT, "border-field")}
          />
        </label>

        <label className="relative block">
          <UserIcon />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
            aria-label="Username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_\-]{3,24}"
            title="3-24 characters: letters, digits, _ or -"
            className={cn(INPUT, "border-field")}
          />
        </label>

        <label className="relative block">
          <LockIcon />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="Create a password"
            aria-label="Password"
            autoComplete="new-password"
            required
            minLength={8}
            className={cn(INPUT, "border-field pr-[46px]")}
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
        </label>

        <label className="relative block">
          <LockIcon />
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="Confirm your password"
            aria-label="Confirm password"
            autoComplete="new-password"
            required
            aria-invalid={mismatch}
            className={cn(INPUT, mismatch ? "border-[#c0483a]" : "border-field")}
          />
        </label>

        <div className="mt-1 grid grid-cols-3 gap-1.5" aria-hidden>
          {[1, 2, 3].map((segment) => (
            <div
              key={segment}
              className={cn("h-1 rounded-sm transition-colors", score >= segment ? tone : "bg-line")}
            />
          ))}
        </div>

        <div className="mb-1.5 flex flex-col gap-1 text-xs text-slate">
          <div className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full", longEnough ? "bg-gold" : "bg-[#c4c4bf]")} />
            At least 8 characters
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full", mixed ? "bg-gold" : "bg-[#c4c4bf]")} />
            Use a mix of letters and numbers
          </div>
        </div>

        {(error || mismatch) && (
          <p className="text-[13px] text-alarm">
            {error ?? "Those passwords do not match."}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-lg bg-ink text-[13px] font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b] disabled:opacity-40"
        >
          CREATE ACCOUNT
        </button>
      </form>

      <div className="mb-1 mt-3.5 flex w-full items-center gap-3 text-[11px] tracking-[0.12em] text-mute">
        <div className="h-px flex-1 bg-line" />
        OR
        <div className="h-px flex-1 bg-line" />
      </div>

      <Link
        href="/play"
        className="flex h-10 items-center px-4 text-[13px] font-bold tracking-[0.12em] text-ink transition-colors hover:text-goldink"
      >
        CONTINUE AS GUEST
      </Link>

      <p className="mt-4 text-[13px] text-slate">
        Already have an account?{" "}
        <Link href="/signin" className="font-bold text-goldink hover:text-ink">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
