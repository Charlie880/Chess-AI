import { NextResponse } from "next/server"
import { callBackend, withIdentity } from "@/lib/server-api"

// Resolving the invitation before anything connects is what lets the page say
// "this is no longer valid" without joining first - and tells the host their
// invitation arrived too late.
export async function GET(_: Request, { params }: { params: { token: string } }) {
  return withIdentity(async (token) => {
    const result = await callBackend(`/invites/${encodeURIComponent(params.token)}`, { token })
    return NextResponse.json(result.data, { status: result.status })
  })
}
