import { type NextRequest, NextResponse } from "next/server"
import { callBackend, withAuth } from "@/lib/server-api"

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") ?? "25"
  return withAuth(async (token) => {
    const result = await callBackend(`/games?limit=${encodeURIComponent(limit)}`, { token })
    return NextResponse.json(result.data, { status: result.status })
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  return withAuth(async (token) => {
    const result = await callBackend("/games", { method: "POST", body, token })
    return NextResponse.json(result.data, { status: result.status })
  })
}
