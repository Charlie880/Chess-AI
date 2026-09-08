import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000"

// The JWT lives in an httpOnly cookie and is attached here, server-side. It is
// never handed to page JavaScript, so an XSS on the page cannot read it.
export const TOKEN_COOKIE = "chess_token"

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
}

export function setTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(TOKEN_COOKIE, token, COOKIE_OPTIONS)
  return response
}

export function clearTokenCookie(response: NextResponse) {
  response.cookies.set(TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 })
  return response
}

export async function authToken(): Promise<string | null> {
  return cookies().get(TOKEN_COOKIE)?.value ?? null
}

type ProxyOptions = { method?: string; body?: unknown; token?: string | null }

/** Call the FastAPI backend and normalise its errors into `{ error }`. */
export async function callBackend(path: string, options: ProxyOptions = {}) {
  const { method = "GET", body, token } = options

  let response: Response
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    })
  } catch {
    return {
      ok: false as const,
      status: 502,
      data: { error: `Cannot reach the API at ${BACKEND_URL}. Is the backend running?` },
    }
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail
    return {
      ok: false as const,
      status: response.status,
      data: { error: typeof detail === "string" ? detail : "Request failed" },
    }
  }
  return { ok: true as const, status: response.status, data }
}

/** Every /api/games route needs the same "are you signed in" preamble. */
export async function withAuth(
  handler: (token: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const token = await authToken()
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  return handler(token)
}
