"use client"

import { useEffect, useRef, useState } from "react"
import type { ChatMessage } from "@/lib/room"
import { cn } from "@/lib/utils"

interface RoomChatProps {
  messages: ChatMessage[]
  youId: string | null
  onSend: (text: string) => void
  disabled?: boolean
}

/** Open to everyone in the room, players and watchers alike. */
export default function RoomChat({ messages, youId, onSend, disabled }: RoomChatProps) {
  const [text, setText] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText("")
  }

  return (
    <div className="flex flex-col rounded-xl border border-line bg-white">
      <div className="border-b border-divider px-[18px] py-3">
        <span className="text-[11px] font-bold tracking-[0.16em] text-mute">CHAT</span>
      </div>

      <div ref={scrollRef} className="flex max-h-56 min-h-[6rem] flex-col gap-2 overflow-y-auto px-[18px] py-3">
        {messages.length === 0 ? (
          <p className="text-[13px] text-mute">Say hello.</p>
        ) : (
          messages.map((message) => (
            <p key={message.id} className="text-[13px] leading-[1.5]">
              <span
                className={cn(
                  "font-bold",
                  message.ownerId && youId && message.ownerId === youId
                    ? "text-goldink"
                    : "text-ink",
                )}
              >
                {message.name}
              </span>{" "}
              <span className="text-slate">{message.text}</span>
            </p>
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-divider px-[18px] py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the room"
          aria-label="Message the room"
          maxLength={500}
          disabled={disabled}
          className="h-10 min-w-0 flex-1 rounded-lg border border-field bg-white px-3 text-[13px] outline-none transition placeholder:text-mute focus:border-gold disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[11px] font-bold tracking-[0.12em] text-white transition-colors hover:bg-[#2e2e2b] disabled:opacity-40"
        >
          SEND
        </button>
      </form>
    </div>
  )
}
