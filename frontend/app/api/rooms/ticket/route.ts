import { NextResponse } from "next/server"
import { callBackend, withIdentity } from "@/lib/server-api"

// A room needs an identity, so this never turns anyone away: a visitor without
// an account is given a guest one here rather than being asked to sign up.
export async function POST() {
  return withIdentity(async (token) => {
    const result = await callBackend("/rooms/ticket", { method: "POST", token })
    return NextResponse.json(result.data, { status: result.status })
  })
}
