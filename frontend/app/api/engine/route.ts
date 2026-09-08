import { type NextRequest, NextResponse } from "next/server"

// Proxied server-side so the browser never talks to the Python API directly
// and the backend needs no public origin.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000"

export async function POST(request: NextRequest) {
  try {
    const { fen, difficulty } = await request.json()

    if (!fen) {
      return NextResponse.json({ error: "FEN position is required" }, { status: 400 })
    }

    const backendResponse = await fetch(`${BACKEND_URL}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, difficulty }),
    })

    const data = await backendResponse.json()

    if (!backendResponse.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Engine error" },
        { status: backendResponse.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Engine proxy error:", error)
    return NextResponse.json(
      { error: `Cannot reach the engine at ${BACKEND_URL}. Is the backend running?` },
      { status: 502 },
    )
  }
}
