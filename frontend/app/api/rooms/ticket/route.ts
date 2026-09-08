import { NextResponse } from "next/server"
import { authToken, callBackend } from "@/lib/server-api"

// Trades the httpOnly session cookie for a short-lived, WebSocket-only token.
// Guests get 401 here and join the room anonymously, which is not an error.
export async function POST() {
  const token = await authToken()
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const result = await callBackend("/rooms/ticket", { method: "POST", token })
  return NextResponse.json(result.data, { status: result.status })
}
