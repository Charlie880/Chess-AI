import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000"

// Two credentials, both httpOnly so page JavaScript can never read either.
//
// The session cookie is an account. The guest cookie is the identity everyone
// else gets, minted on first visit and kept for a year, so somebody who never
// signs up still owns their games and still sees their own history. Signing
// out clears only the session, which drops you back to the guest you were.
export const TOKEN_COOKIE = "chess_token"
export const GUEST_COOKIE = "chess_guest"

const BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
}

const SESSION_OPTIONS = { ...BASE, maxAge: 60 * 60 * 24 * 7 }
const GUEST_OPTIONS = { ...BASE, maxAge: 60 * 60 * 24 * 365 }

export function setTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(TOKEN_COOKIE, token, SESSION_OPTIONS)
  return response
}

export function setGuestCookie(response: NextResponse, token: string) {
  response.cookies.set(GUEST_COOKIE, token, GUEST_OPTIONS)
  return response
}

export function clearTokenCookie(response: NextResponse) {
  response.cookies.set(TOKEN_COOKIE, "", { ...SESSION_OPTIONS, maxAge: 0 })
  return response
}

export function sessionToken(): string | null {
  return cookies().get(TOKEN_COOKIE)?.value ?? null
}

export function guestToken(): string | null {
  return cookies().get(GUEST_COOKIE)?.value ?? null
}

/** Whichever credential the caller has, preferring a real account. */
export async function authToken(): Promise<string | null> {
  return sessionToken() ?? guestToken()
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

/** A credential for this visitor, minting a guest identity if they have none.
 * `freshGuest` must be written onto the response so the same guest comes back
 * next time; otherwise every request would mint a new one and history would
 * never accumulate. */
export async function ensureIdentity(): Promise<{
  token: string | null
  freshGuest?: string
}> {
  const existing = sessionToken() ?? guestToken()
  if (existing) return { token: existing }

  const minted = await callBackend("/auth/guest", { method: "POST" })
  if (!minted.ok) return { token: null }

  const token = (minted.data as { token: string }).token
  return { token, freshGuest: token }
}

/** Every /api/games and /api/rooms route needs the same identity preamble.
 *
 * A credential the API rejects (expired, or signed by a different deployment)
 * would otherwise fail every request forever, because the cookie keeps being
 * sent. So a 401 drops the bad credential and tries again: first as the guest
 * already on this browser, then as a fresh guest. */
export async function withIdentity(
  handler: (token: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const { token, freshGuest } = await ensureIdentity()
  if (!token) {
    return NextResponse.json({ error: "Could not establish an identity" }, { status: 503 })
  }
  let response = await handler(token)
  let guestToSet = freshGuest
  let dropSession = false

  if (response.status === 401) {
    dropSession = sessionToken() !== null
    let next = dropSession ? guestToken() : null
    if (next) {
      response = await handler(next)
    }
    if (!next || response.status === 401) {
      const minted = await callBackend("/auth/guest", { method: "POST" })
      if (!minted.ok) return response
      next = (minted.data as { token: string }).token
      guestToSet = next
      response = await handler(next)
    }
  }

  if (dropSession) clearTokenCookie(response)
  return guestToSet ? setGuestCookie(response, guestToSet) : response
}
