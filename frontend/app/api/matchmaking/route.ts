import { NextResponse } from "next/server"
import { callBackend, withIdentity } from "@/lib/server-api"

const proxy = (method: string) =>
  withIdentity(async (token) => {
    const result = await callBackend("/matchmaking", { method, token })
    return NextResponse.json(result.data, { status: result.status })
  })

export const POST = () => proxy("POST")
export const GET = () => proxy("GET")
export const DELETE = () => proxy("DELETE")
