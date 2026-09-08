import { NextResponse } from "next/server"
import { clearTokenCookie } from "@/lib/server-api"

export async function POST() {
  return clearTokenCookie(NextResponse.json({ ok: true }))
}
