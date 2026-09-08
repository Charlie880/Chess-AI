import { NextResponse } from "next/server"
import { callBackend, withAuth } from "@/lib/server-api"

export async function GET() {
  return withAuth(async (token) => {
    const result = await callBackend("/games/stats", { token })
    return NextResponse.json(result.data, { status: result.status })
  })
}
