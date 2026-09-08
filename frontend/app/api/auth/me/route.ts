import { NextResponse } from "next/server"
import { authToken, callBackend, clearTokenCookie } from "@/lib/server-api"

export async function GET() {
  const token = await authToken()
  if (!token) return NextResponse.json({ user: null })

  const result = await callBackend("/auth/me", { token })
  if (result.ok) return NextResponse.json({ user: result.data })

  // Only an actual rejection means the token is dead. A 502 from a backend
  // that is restarting would otherwise silently sign the user out.
  if (result.status === 401) {
    return clearTokenCookie(NextResponse.json({ user: null }))
  }
  return NextResponse.json({ user: null, error: (result.data as { error?: string }).error })
}
