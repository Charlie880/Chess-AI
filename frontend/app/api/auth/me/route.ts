import { NextResponse } from "next/server"
import { authToken, callBackend, clearTokenCookie } from "@/lib/server-api"

export async function GET() {
  const token = await authToken()
  if (!token) return NextResponse.json({ user: null })

  const result = await callBackend("/auth/me", { token })
  if (!result.ok) {
    // Expired or revoked: drop the cookie so the client stops retrying with it.
    return clearTokenCookie(NextResponse.json({ user: null }))
  }
  return NextResponse.json({ user: result.data })
}
