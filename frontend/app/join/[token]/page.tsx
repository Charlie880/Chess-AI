"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import SiteMark from "@/components/SiteMark"

type Invitation = {
  status: "ok" | "taken" | "gone"
  kind: "play" | "watch" | null
  roomId: string | null
  canWatch?: boolean
}

export default function JoinPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [invitation, setInvitation] = useState<Invitation | null>(null)

  useEffect(() => {
    fetch(`/api/invites/${params.token}`)
      .then((r) => r.json())
      .then((data: Invitation) => {
        setInvitation(data)
        // A good invitation is not worth a screen of its own.
        if (data.status === "ok" && data.roomId) {
          router.replace(`/room/${data.roomId}?as=${data.kind === "watch" ? "watch" : "play"}`)
        }
      })
      .catch(() => setInvitation({ status: "gone", kind: null, roomId: null }))
  }, [params.token, router])

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="border-b border-line bg-white"
        style={{ padding: "14px clamp(16px, 4vw, 48px)" }}
      >
        <SiteMark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <section className="w-full max-w-[420px] text-center">{children}</section>
      </main>
    </div>
  )

  if (!invitation || invitation.status === "ok") {
    return shell(<p className="text-[13px] text-mute">Opening your invitation…</p>)
  }

  if (invitation.status === "taken") {
    return shell(
      <>
        <p className="text-[11px] font-bold tracking-[0.16em] text-mute">INVITATION</p>
        <h1 className="mt-3 font-display text-[38px] font-medium leading-[1.05] tracking-[-0.015em]">
          Both seats are taken
        </h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-slate">
          This invitation to play is no longer valid — someone sat down first. Whoever invited
          you has been told.
        </p>
        {invitation.roomId && (
          <Link
            href={`/room/${invitation.roomId}?as=watch`}
            className="mt-7 flex h-12 items-center justify-center rounded-lg bg-ink text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b]"
          >
            WATCH INSTEAD
          </Link>
        )}
        <Link
          href="/play"
          className="mt-3 flex h-12 items-center justify-center rounded-lg border border-field bg-white text-[13px] font-semibold text-ink transition-colors hover:border-ink"
        >
          Play your own game
        </Link>
      </>,
    )
  }

  return shell(
    <>
      <p className="text-[11px] font-bold tracking-[0.16em] text-mute">INVITATION</p>
      <h1 className="mt-3 font-display text-[38px] font-medium leading-[1.05] tracking-[-0.015em]">
        This link has expired
      </h1>
      <p className="mt-4 text-[15px] leading-[1.55] text-slate">
        The room it pointed at is gone. Rooms are closed once everyone has left.
      </p>
      <Link
        href="/play"
        className="mt-7 flex h-12 items-center justify-center rounded-lg bg-ink text-xs font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b]"
      >
        PLAY A GAME
      </Link>
    </>,
  )
}
