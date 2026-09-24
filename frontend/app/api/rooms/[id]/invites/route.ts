import { type NextRequest, NextResponse } from "next/server"
import { callBackend, withIdentity } from "@/lib/server-api"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  return withIdentity(async (token) => {
    const result = await callBackend(`/rooms/${encodeURIComponent(params.id)}/invites`, {
      method: "POST",
      body,
      token,
    })
    return NextResponse.json(result.data, { status: result.status })
  })
}
