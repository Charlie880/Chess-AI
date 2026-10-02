"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import AuthPanel, { type User } from "@/components/AuthPanel"
import SiteMark from "@/components/SiteMark"
import { cn } from "@/lib/utils"

type Queue = { status: "idle" | "waiting" | "matched"; roomId?: string; waiting?: number }

export default function ChoosePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [queue, setQueue] = useState<Queue>({ status: "idle" })
  const [busy, setBusy] = useState<"invite" | "quick" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const polling = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadIdentity = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
  }, [])

  useEffect(loadIdentity, [loadIdentity])

  const signedIn = user?.kind === "user"

  const stopPolling = useCallback(() => {
    if (polling.current) clearInterval(polling.current)
    polling.current = null
  }, [])

  // Leaving the page should give the seat back rather than stranding someone
  // in a queue they can no longer see.
  useEffect(() => {
    return () => {
      stopPolling()
      if (queue.status === "waiting") void fetch("/api/matchmaking", { method: "DELETE" })
    }
  }, [queue.status, stopPolling])

  const handleQueue = useCallback(
    (next: Queue) => {
      setQueue(next)
      if (next.status === "matched" && next.roomId) {
        stopPolling()
        router.push(`/room/${next.roomId}?as=play`)
      }
    },
    [router, stopPolling],
  )

  const quickPlay = async () => {
    setBusy("quick")
    setError(null)
    try {
      const response = await fetch("/api/matchmaking", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not join the queue")
      handleQueue(data)
      if (data.status === "waiting" && !polling.current) {
        // A queue you sit in for seconds does not earn its own socket.
        polling.current = setInterval(async () => {
          const poll = await fetch("/api/matchmaking").then((r) => r.json()).catch(() => null)
          if (poll) handleQueue(poll)
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the queue")
    } finally {
      setBusy(null)
    }
  }

  const cancelQueue = async () => {
    stopPolling()
    await fetch("/api/matchmaking", { method: "DELETE" }).catch(() => {})
    setQueue({ status: "idle" })
  }

  const openRoom = async () => {
    setBusy("invite")
    setError(null)
    try {
      const response = await fetch("/api/rooms", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not open a room")
      router.push(`/room/${data.id}?as=play`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open a room")
      setBusy(null)
    }
  }

  const card = "rounded-xl border border-line bg-white p-6"
  const primary =
    "h-12 w-full rounded-lg bg-ink text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b] disabled:opacity-40"
  const secondary =
    "h-12 w-full rounded-lg border border-gold bg-goldwash text-[13px] font-bold text-goldink transition-colors hover:bg-goldwarm disabled:opacity-40"

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="flex items-center justify-between gap-4 border-b border-line bg-white"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />
        <AuthPanel user={user} onSignedOut={loadIdentity} />
      </header>

      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-12 sm:py-16">
        <h1 className="font-display text-[34px] font-medium leading-tight tracking-[-0.01em]">
          What kind of game?
        </h1>
        <p className="mt-2 text-[15px] text-slate">
          Playing another person needs an account, so the result has somewhere to go.
        </p>

        {error && <p className="mt-4 text-[13px] text-alarm">{error}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <section className={card}>
            <h2 className="text-[15px] font-bold">Play the computer</h2>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-slate">
              A neural net, a 2-ply search, or Stockfish. No account needed.
            </p>
            <Link
              href="/play/computer"
              className={cn(primary, "mt-5 flex items-center justify-center")}
            >
              PLAY THE COMPUTER
            </Link>
          </section>

          <section className={card}>
            <h2 className="text-[15px] font-bold">Play a person</h2>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-slate">
              {signedIn
                ? "Invite someone by link, or be matched with whoever is waiting."
                : "Sign in to take a seat. Anyone can still watch a game you link them to."}
            </p>

            {queue.status === "waiting" ? (
              <div className="mt-5">
                <p className="flex items-center gap-2.5 text-[13px] text-slate">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                  Looking for an opponent…
                </p>
                <button type="button" onClick={cancelQueue} className={cn(primary, "mt-3")}>
                  CANCEL
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => void quickPlay()}
                  disabled={!signedIn || busy !== null}
                  className={primary}
                >
                  {busy === "quick" ? "JOINING…" : "QUICK PLAY"}
                </button>
                <button
                  type="button"
                  onClick={() => void openRoom()}
                  disabled={!signedIn || busy !== null}
                  className={secondary}
                >
                  {busy === "invite" ? "Opening a room…" : "Invite someone"}
                </button>
              </div>
            )}

            {!signedIn && (
              <p className="mt-3 text-[13px] text-mute">
                <Link href="/signin" className="font-bold text-goldink hover:text-ink">
                  Sign in
                </Link>{" "}
                to play a person.
              </p>
            )}
          </section>
        </div>

        <p className="mt-6 text-center text-[13px] text-mute">
          Or{" "}
          <Link href="/games" className="font-bold text-goldink hover:text-ink">
            replay a played game
          </Link>{" "}
          with its chat. No account needed.
        </p>
      </main>
    </div>
  )
}
