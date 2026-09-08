import { NextResponse } from "next/server"
import {
  callBackend,
  clearTokenCookie,
  guestToken,
  sessionToken,
  setGuestCookie,
} from "@/lib/server-api"

/** Who is this visitor? An account if they signed in, otherwise the guest
 * identity they already have, otherwise a new one. Everyone leaves here with
 * an identity, because rooms and history are both scoped by it. */
export async function GET() {
  const session = sessionToken()
  if (session) {
    const result = await callBackend("/auth/me", { token: session })
    if (result.ok) return NextResponse.json({ user: result.data })
    // Only a rejection means the session is dead. A 502 from a restarting
    // backend must not sign anyone out.
    if (result.status !== 401) {
      return NextResponse.json({ user: null, error: (result.data as { error?: string }).error })
    }
  }

  const guest = guestToken()
  if (guest) {
    const result = await callBackend("/auth/me", { token: guest })
    if (result.ok) {
      const response = NextResponse.json({ user: result.data })
      return session ? clearTokenCookie(response) : response
    }
    if (result.status !== 401) {
      return NextResponse.json({ user: null, error: (result.data as { error?: string }).error })
    }
  }

  const minted = await callBackend("/auth/guest", { method: "POST" })
  if (!minted.ok) return NextResponse.json({ user: null }, { status: minted.status })

  const { token, user } = minted.data as { token: string; user: unknown }
  const response = NextResponse.json({ user })
  return setGuestCookie(session ? clearTokenCookie(response) : response, token)
}
