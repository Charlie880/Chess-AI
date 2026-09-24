"""Quick play: a queue of one.

Anyone waiting sits in `WAITING` until somebody else asks, at which point the
two are paired into a room with their seats already reserved. There is no
rating and no preference, so the queue never needs to be searched - the next
arrival takes whoever is there.

The client polls rather than holding a second WebSocket open: a queue you sit
in for a few seconds does not earn its own connection.
"""

import random
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import rooms

# Someone who stopped polling is gone. Their entry is swept on the next ask.
STALE_AFTER = timedelta(seconds=20)


@dataclass
class Waiting:
    owner_id: str
    name: str
    joined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    seen_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    room_id: str | None = None  # set once matched


WAITING: dict[str, Waiting] = {}


def _sweep(now: datetime) -> None:
    for owner_id, entry in list(WAITING.items()):
        if entry.room_id is None and now - entry.seen_at > STALE_AFTER:
            del WAITING[owner_id]


def _pair(a: Waiting, b: Waiting) -> str:
    """Build the room both will walk into, seats already theirs."""
    room = rooms.create_room(host_id=a.owner_id)
    white, black = (a, b) if random.random() < 0.5 else (b, a)
    for color, entry in (("w", white), ("b", black)):
        room.seats[color] = rooms.Seat(
            kind="human",
            name=entry.name,
            member_id=None,  # reserved: they have not connected yet
            owner_kind="user",
            owner_id=entry.owner_id,
        )
    room.status = "playing"
    room.touch()
    return room.id


def join(owner_id: str, name: str) -> dict:
    """Enter the queue, or take whoever is already in it."""
    now = datetime.now(timezone.utc)
    _sweep(now)

    mine = WAITING.get(owner_id)
    if mine and mine.room_id:
        return {"status": "matched", "roomId": mine.room_id}

    # Someone else waiting? Pair with the one who has waited longest.
    others = sorted(
        (e for oid, e in WAITING.items() if oid != owner_id and e.room_id is None),
        key=lambda e: e.joined_at,
    )
    if others:
        other = others[0]
        room_id = _pair(Waiting(owner_id=owner_id, name=name), other)
        other.room_id = room_id
        WAITING.pop(owner_id, None)
        return {"status": "matched", "roomId": room_id}

    if mine:
        mine.seen_at = now
        mine.name = name
    else:
        WAITING[owner_id] = Waiting(owner_id=owner_id, name=name)
    return {"status": "waiting", "waiting": len(WAITING)}


def poll(owner_id: str) -> dict:
    """Still waiting, or matched while we were away?"""
    now = datetime.now(timezone.utc)
    entry = WAITING.get(owner_id)
    if entry is None:
        return {"status": "idle"}
    entry.seen_at = now
    if entry.room_id:
        del WAITING[owner_id]  # handed over; stop tracking them
        return {"status": "matched", "roomId": entry.room_id}
    _sweep(now)
    return {"status": "waiting", "waiting": len(WAITING)}


def leave(owner_id: str) -> dict:
    entry = WAITING.pop(owner_id, None)
    # Leaving after a match still hands over the room: the opponent is already
    # sitting in it and should not be stranded.
    if entry and entry.room_id:
        return {"status": "matched", "roomId": entry.room_id}
    return {"status": "idle"}
