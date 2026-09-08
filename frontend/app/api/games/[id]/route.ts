import { type NextRequest, NextResponse } from "next/server"
import { callBackend, withAuth } from "@/lib/server-api"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  return withAuth(async (token) => {
    const result = await callBackend(`/games/${encodeURIComponent(params.id)}`, {
      method: "PUT",
      body,
      token,
    })
    return NextResponse.json(result.data, { status: result.status })
  })
}
