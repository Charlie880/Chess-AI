import { NextResponse } from "next/server"
import { callBackend, withIdentity } from "@/lib/server-api"

export async function GET() {
  return withIdentity(async (token) => {
    const result = await callBackend("/games/public", { token })
    return NextResponse.json(result.data, { status: result.status })
  })
}
