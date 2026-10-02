import { callBackend } from "@/lib/server-api"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return callBackend(`/games/${id}/chat`, { method: "GET" })
}
