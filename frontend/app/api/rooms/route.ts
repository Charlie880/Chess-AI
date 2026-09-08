import { NextResponse } from "next/server"
import { callBackend } from "@/lib/server-api"

// Anyone can open a room, signed in or not: the link is the invitation.
export async function POST() {
  const result = await callBackend("/rooms", { method: "POST", body: {} })
  return NextResponse.json(result.data, { status: result.status })
}
