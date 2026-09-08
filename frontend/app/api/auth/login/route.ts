import { type NextRequest, NextResponse } from "next/server"
import { callBackend, setTokenCookie } from "@/lib/server-api"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await callBackend("/auth/login", { method: "POST", body })
  if (!result.ok) return NextResponse.json(result.data, { status: result.status })

  const { token, user } = result.data as { token: string; user: unknown }
  return setTokenCookie(NextResponse.json({ user }), token)
}
