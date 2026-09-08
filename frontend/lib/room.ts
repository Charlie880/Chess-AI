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
 * cannot proxy one. Same host as the page by default, so a link that works for
 * you works for whoever you send it to. */
function socketUrl(roomId: string): string {
  const configured = process.env.NEXT_PUBLIC_API_URL
  const base = configured || `${location.protocol}//${location.hostname}:8000`
  return `${base.replace(/^http/, "ws")}/rooms/${encodeURIComponent(roomId)}/ws`
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
      // Signed-in players get a short-lived ticket so the room can attach the
      // game to their history. Guests simply have none, and still play.
      let ticket: string | undefined
      try {
        const response = await fetch("/api/rooms/ticket", { method: "POST" })
        if (response.ok) ticket = (await response.json()).ticket
      } catch {
        // Not signed in, or the API is down. Either way, join as a guest.
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
