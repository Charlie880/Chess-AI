import { NextResponse } from "next/server"
import { callBackend, withIdentity } from "@/lib/server-api"

// Opening a room needs an account: the backend refuses a guest, and the error
// it gives back is what the chooser page shows.
export async function POST() {
  return withIdentity(async (token) => {
    const result = await callBackend("/rooms", { method: "POST", token, body: {} })
    return NextResponse.json(result.data, { status: result.status })
  })
}
