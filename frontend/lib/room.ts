"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Difficulty } from "@/lib/engines"

export type SeatInfo = {
  kind: "human" | "engine"
  name: string
  difficulty: Difficulty | null
  isYou: boolean
} | null

export type RoomState = {
  roomId: string
  fen: string
  /** SAN. The client replays these to derive the board, so there is one
   * description of the position rather than two that can drift apart. */
  moves: string[]
  turn: "w" | "b"
  status: "waiting" | "playing" | "finished"
  result: string | null
  termination: string | null
  seats: { w: SeatInfo; b: SeatInfo }
  watchers: string[]
  you: { id: string | null; color: "w" | "b" | null }
}

export type Connection = "connecting" | "open" | "closed"

/** The WebSocket runs against the API directly, because a Next route handler
 * cannot proxy one.
 *
 * Default: same hostname as the page, port 8000. That covers localhost and a
 * machine on your own network. Behind a tunnel the page is served over https
 * from a public hostname, so the scheme has to become wss (a ws:// socket on
 * an https page is blocked as mixed content) and NEXT_PUBLIC_API_URL has to
 * name wherever the API is tunnelled to. */
function socketUrl(roomId: string): string {
  const configured = process.env.NEXT_PUBLIC_API_URL
  const base = configured || `${location.protocol}//${location.hostname}:8000`
  const scheme = base.startsWith("https") ? "wss" : "ws"
  return `${base.replace(/^https?/, scheme)}/rooms/${encodeURIComponent(roomId)}/ws`
}

export function useRoom(roomId: string, name: string, role: "play" | "watch") {
  const [state, setState] = useState<RoomState | null>(null)
  const [connection, setConnection] = useState<Connection>("connecting")
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket

    const start = async () => {
      // A room refuses a join without a ticket, so this is not optional. It
      // works for guests too: someone without an account is handed a guest
      // identity here rather than being asked to sign up.
      let ticket: string
      try {
        const response = await fetch("/api/rooms/ticket", { method: "POST" })
        const data = await response.json()
        if (!response.ok || !data.ticket) throw new Error(data.error ?? "No identity")
        ticket = data.ticket
      } catch (err) {
        if (!cancelled) {
          setConnection("closed")
          setError(
            err instanceof Error && err.message !== "No identity"
              ? err.message
              : "Could not establish an identity for this room. Reload to try again.",
          )
        }
        return
      }
      if (cancelled) return

      socket = new WebSocket(socketUrl(roomId))
      socketRef.current = socket

      socket.onopen = () => {
        setConnection("open")
        socket.send(JSON.stringify({ type: "join", name, role, ticket }))
      }
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === "state") {
          setState(message as RoomState)
          setError(null)
        } else if (message.type === "error") {
          setError(message.message)
        }
      }
      socket.onclose = (event) => {
        setConnection("closed")
        if (event.code === 4404) setError("That room does not exist, or it has expired.")
        if (event.code === 4401) setError("Your identity was not accepted. Reload to try again.")
      }
      socket.onerror = () => setConnection("closed")
    }

    void start()
    return () => {
      cancelled = true
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [roomId, name, role])

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  return { state, connection, error, send, clearError: () => setError(null) }
}
