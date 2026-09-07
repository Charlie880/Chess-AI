import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { fen, difficulty } = await request.json();

    if (!fen) {
      return NextResponse.json({ error: "FEN position is required" }, { status: 400 });
    }

    // Call backend
    const backendResponse = await fetch("http://127.0.0.1:8000/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, difficulty }),
    });

    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      console.error("Backend error:", data);
      return NextResponse.json({ error: data.detail || "Backend error" }, { status: backendResponse.status });
    }

    // --- Return backend response directly to UI ---
    return NextResponse.json(data);
  } catch (error) {
    console.error("Engine API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}