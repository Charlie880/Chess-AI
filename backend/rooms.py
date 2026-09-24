"""Shared game rooms.

The server owns the board. In single player the client could hold the position
and the API just answered with a move, because the only person it could cheat
was themselves. With two people in a room that stops being true, so every move
is validated here and the position is broadcast from here.

Rooms live in memory: they are conversations, not records. Finished games and
chat are written to Mongo for whoever was signed in (see routes_rooms).
"""

import asyncio
import logging
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import anyio.to_thread
import chess

from engines import cnn_engine, minmax_engine, stockfish_engine

log = logging.getLogger(__name__)

COLORS = ("w", "b")
ENGINE_MOVERS = {
    "easy": cnn_engine.get_move,
    "normal": lambda board: minmax_engine.get_move(board, depth=2),
    "hard": stockfish_engine.get_move,
}

# A room with nobody in it is rubbish after this long. Pruned lazily on create,
# so there is no background task to supervise.
IDLE_ROOM_TTL = timedelta(hours=6)
MAX_ROOMS = 500
MAX_NAME_LENGTH = 24
MAX_CHAT_LENGTH = 500
MAX_CHAT_KEPT = 50
MAX_INVITES_PER_ROOM = 50

# How long a seat is held for someone whose connection dropped. A refresh or a
# flaky network is not a resignation; walking away is. Tests shorten this.
GRACE_SECONDS = 60


@dataclass
class Seat:
    """One side of the board. Either a person or one of the engines.

    `owner_id` is the identity that holds the seat; `member_id` is the socket
    currently sitting in it, which is None while they are away. Separating the
    two is what lets someone refresh without losing their game.
    """

    kind: str  # "human" | "engine"
    name: str
    member_id: str | None = None  # the live connection, None while away
    owner_kind: str | None = None  # "user" for a seat, None for an engine
    owner_id: str | None = None
    difficulty: str | None = None  # engines only
    away_since: datetime | None = None


@dataclass
class Member:
    id: str
    name: str
    owner_kind: str  # "user" | "guest": everyone in a room has an identity
    owner_id: str
    socket: object  # WebSocket; typed loosely to keep this module framework-free


@dataclass
class Invite:
    token: str
    room_id: str
    kind: str  # "play" | "watch"
    created_by: str  # owner_id of whoever issued it
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class Room:
    id: str
    # Whoever may invite. The room belongs to the game, not to a person: if the
    # host leaves their seat the remaining player inherits it.
    host_id: str | None = None
    board: chess.Board = field(default_factory=chess.Board)
    moves: list[str] = field(default_factory=list)
    seats: dict[str, Seat | None] = field(default_factory=lambda: {"w": None, "b": None})
    members: dict[str, Member] = field(default_factory=dict)
    chat: list[dict] = field(default_factory=list)
    status: str = "waiting"  # waiting | playing | finished
    result: str | None = None
    termination: str | None = None
    # Set once the finished game has been written to history, so no path
    # through the socket loop can file the same game twice.
    saved: bool = False
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    touched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def touch(self) -> None:
        self.touched_at = datetime.now(timezone.utc)

    def seat_of(self, member_id: str | None) -> str | None:
        """Which seat this live connection is sitting in."""
        if member_id is None:
            return None
        for color, seat in self.seats.items():
            if seat and seat.kind == "human" and seat.member_id == member_id:
                return color
        return None

    def seat_for_owner(self, owner_id: str | None) -> str | None:
        """Which seat this identity holds, connected or not."""
        if owner_id is None:
            return None
        for color, seat in self.seats.items():
            if seat and seat.kind == "human" and seat.owner_id == owner_id:
                return color
        return None

    def both_seats_filled(self) -> bool:
        return all(self.seats[color] is not None for color in COLORS)

    def open_seat(self) -> str | None:
        for color in COLORS:
            if self.seats[color] is None:
                return color
        return None

    def may_invite(self, owner_id: str | None) -> bool:
        """The host invites. If the host has left their seat, whoever is still
        sitting down inherits the right."""
        return owner_id is not None and owner_id == self.host_id

    def snapshot(self, member_id: str | None = None) -> dict:
        """Everything a client needs to draw the room. The move list goes as
        SAN and the client replays it, so there is one description of a
        position rather than two that can drift apart."""
        member = self.members.get(member_id) if member_id else None
        owner_id = member.owner_id if member else None
        return {
            "type": "state",
            "roomId": self.id,
            "fen": self.board.fen(),
            "moves": list(self.moves),
            "turn": "w" if self.board.turn == chess.WHITE else "b",
            "status": self.status,
            "result": self.result,
            "termination": self.termination,
            "seats": {
                color: None
                if seat is None
                else {
                    "kind": seat.kind,
                    "name": seat.name,
                    "difficulty": seat.difficulty,
                    "isYou": seat.kind == "human" and seat.member_id == member_id,
                    "away": seat.away_since is not None,
                    "secondsLeft": _seconds_left(seat),
                }
                for color, seat in self.seats.items()
            },
            "watchers": [
                m.name for m in self.members.values() if self.seat_of(m.id) is None
            ],
            "chat": list(self.chat),
            "you": {
                "id": member_id,
                "color": self.seat_of(member_id),
                "canInvite": self.may_invite(owner_id),
                "canPlay": member.owner_kind == "user" if member else False,
            },
        }


def _seconds_left(seat: Seat) -> int | None:
    if seat.away_since is None:
        return None
    gone = (datetime.now(timezone.utc) - seat.away_since).total_seconds()
    return max(0, int(GRACE_SECONDS - gone))


ROOMS: dict[str, Room] = {}
INVITES: dict[str, Invite] = {}


def _prune() -> None:
    cutoff = datetime.now(timezone.utc) - IDLE_ROOM_TTL
    for room_id, room in list(ROOMS.items()):
        if not room.members and room.touched_at < cutoff:
            del ROOMS[room_id]
            for token, invite in list(INVITES.items()):
                if invite.room_id == room_id:
                    del INVITES[token]


def create_room(host_id: str) -> Room:
    _prune()
    if len(ROOMS) >= MAX_ROOMS:
        raise RuntimeError("Too many open rooms, try again later")
    # The id is the only thing protecting a room, so it has to be unguessable.
    room = Room(id=secrets.token_urlsafe(9), host_id=host_id)
    ROOMS[room.id] = room
    return room


def get_room(room_id: str) -> Room | None:
    return ROOMS.get(room_id)


def clean_name(name: str | None, fallback: str = "Guest") -> str:
    name = (name or "").strip()[:MAX_NAME_LENGTH]
    return name or fallback


class MoveRejected(Exception):
    """Raised for anything the asker was not allowed to do."""


# ------------------------------------------------------------------ invites --


def make_invite(room: Room, kind: str, owner_id: str) -> Invite:
    if kind not in ("play", "watch"):
        raise MoveRejected("There is no such invitation")
    if not room.may_invite(owner_id):
        raise MoveRejected("Only the host can invite")
    if len([i for i in INVITES.values() if i.room_id == room.id]) >= MAX_INVITES_PER_ROOM:
        raise MoveRejected("Too many invitations for this room")

    invite = Invite(token=secrets.token_urlsafe(12), room_id=room.id, kind=kind, created_by=owner_id)
    INVITES[invite.token] = invite
    return invite


def find_invite(token: str) -> Invite | None:
    return INVITES.get(token)


def invite_status(invite: Invite, owner_id: str | None = None) -> str:
    """"ok", or why this invitation cannot be used.

    A watch invitation never expires - the point of it is unlimited viewers. A
    play invitation is only good while a seat is open, so one sent after both
    seats filled is dead on arrival.
    """
    room = get_room(invite.room_id)
    if room is None:
        return "gone"
    if invite.kind == "watch":
        return "ok"
    if room.seat_for_owner(owner_id) is not None:
        return "ok"  # already your seat; the link just takes you back to it
    if room.open_seat() is None:
        return "taken"
    return "ok"


# -------------------------------------------------------------------- seats --


def claim_seat(room: Room, color: str, member: Member) -> None:
    """Sit down, or come back to a seat already yours.

    Seats need an account. A guest has no stable identity to award a game to,
    and a recorded result with nobody behind it is worth nothing.
    """
    if color not in COLORS:
        raise MoveRejected("There is no such seat")
    if member.owner_kind != "user":
        raise MoveRejected("Sign in to take a seat")

    held = room.seat_for_owner(member.owner_id)
    if held is not None and held != color:
        raise MoveRejected("You are already playing")

    seat = room.seats[color]
    if seat is not None and seat.owner_id != member.owner_id:
        raise MoveRejected("That seat is taken")

    if seat is None:
        room.seats[color] = Seat(
            kind="human",
            name=member.name,
            member_id=member.id,
            owner_kind="user",
            owner_id=member.owner_id,
        )
    else:
        # Reclaiming after a drop: the grace timer stops here.
        seat.member_id = member.id
        seat.name = member.name
        seat.away_since = None

    if room.both_seats_filled() and room.status == "waiting":
        room.status = "playing"
    room.touch()


def seat_engine(room: Room, color: str, difficulty: str, label: str) -> None:
    if color not in COLORS:
        raise MoveRejected("There is no such seat")
    if room.seats[color] is not None:
        raise MoveRejected("That seat is taken")
    room.seats[color] = Seat(kind="engine", name=label, difficulty=difficulty)
    if room.both_seats_filled() and room.status == "waiting":
        room.status = "playing"
    room.touch()


def clear_seat(room: Room, color: str) -> None:
    """Only for engine seats, and only before a game starts."""
    seat = room.seats.get(color)
    if seat is None or seat.kind != "engine":
        raise MoveRejected("There is no engine in that seat")
    if room.moves:
        raise MoveRejected("A game is already under way")
    room.seats[color] = None
    room.status = "waiting"
    room.touch()


def stand(room: Room, member_id: str) -> None:
    color = room.seat_of(member_id)
    if color is None:
        raise MoveRejected("You are not sitting down")
    if room.moves and room.status != "finished":
        raise MoveRejected("You cannot leave a game in progress. Resign instead.")
    room.seats[color] = None
    room.status = "waiting"
    inherit_host(room)
    room.touch()


def mark_away(room: Room, member_id: str) -> str | None:
    """A seated connection dropped. Hold the seat and start the clock.

    Before any move is played there is nothing to forfeit, so the seat is just
    released - otherwise a room could sit half-occupied by someone who opened
    the link and closed the tab.
    """
    color = room.seat_of(member_id)
    if color is None:
        return None
    seat = room.seats[color]

    if not room.moves or room.status == "finished":
        room.seats[color] = None
        room.status = "finished" if room.status == "finished" else "waiting"
        inherit_host(room)
        room.touch()
        return None

    seat.member_id = None
    seat.away_since = datetime.now(timezone.utc)
    room.touch()
    return color


def absence_expired(room: Room, color: str) -> bool:
    seat = room.seats.get(color)
    if seat is None or seat.away_since is None:
        return False
    return _seconds_left(seat) == 0


def forfeit_absent(room: Room, color: str) -> bool:
    """The player who walked away loses. Returns whether anything changed."""
    if room.status == "finished" or not absence_expired(room, color):
        return False
    room.result = "0-1" if color == "w" else "1-0"
    room.termination = "abandoned"
    room.status = "finished"
    room.touch()
    return True


def inherit_host(room: Room) -> None:
    """If the host no longer holds a seat, the other player inherits the right
    to invite. The room belongs to the game, not to whoever opened it."""
    if room.host_id and room.seat_for_owner(room.host_id) is not None:
        return
    for color in COLORS:
        seat = room.seats[color]
        if seat and seat.kind == "human" and seat.owner_id:
            room.host_id = seat.owner_id
            return


# --------------------------------------------------------------------- chat --


def add_chat(room: Room, member: Member, text: str) -> dict:
    text = (text or "").strip()[:MAX_CHAT_LENGTH]
    if not text:
        raise MoveRejected("Say something first")
    message = {
        "id": secrets.token_urlsafe(8),
        "name": member.name,
        "ownerId": member.owner_id,
        "text": text,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    room.chat.append(message)
    del room.chat[:-MAX_CHAT_KEPT]  # the transcript is in Mongo; this is a tail
    room.touch()
    return message


# -------------------------------------------------------------------- moves --


def _describe_end(board: chess.Board) -> tuple[str | None, str | None]:
    """(result, termination) for a finished position, or (None, None)."""
    if board.is_checkmate():
        return ("0-1" if board.turn == chess.WHITE else "1-0", "checkmate")
    if board.is_stalemate():
        return ("1/2-1/2", "stalemate")
    if board.is_insufficient_material() or board.can_claim_draw():
        return ("1/2-1/2", "draw")
    return (None, None)


def _settle(room: Room) -> None:
    if room.board.is_game_over(claim_draw=True):
        room.result, room.termination = _describe_end(room.board)
        room.status = "finished"


def apply_move(room: Room, color: str, uci: str) -> chess.Move:
    """Validate and play one move. Every guard here is load-bearing: the client
    asking is not the client we trust."""
    if room.status == "finished":
        raise MoveRejected("This game is over")
    if not room.both_seats_filled():
        raise MoveRejected("Both seats need to be filled first")

    turn = "w" if room.board.turn == chess.WHITE else "b"
    if color != turn:
        raise MoveRejected("Not your turn")

    try:
        move = chess.Move.from_uci(uci)
    except ValueError:
        raise MoveRejected("That is not a move")
    if move not in room.board.legal_moves:
        raise MoveRejected("That move is not legal")

    room.moves.append(room.board.san(move))  # SAN must be read before the push
    room.board.push(move)
    room.status = "playing"
    _settle(room)
    room.touch()
    return move


async def play_engine_moves(room: Room) -> bool:
    """Let engine seats move until it is a human's turn again. Returns whether
    anything was played. Engines run in a worker thread; a 3-ply search on the
    event loop would freeze every other room on the process."""
    played = False
    while room.status != "finished":
        turn = "w" if room.board.turn == chess.WHITE else "b"
        seat = room.seats[turn]
        if seat is None or seat.kind != "engine":
            break

        mover = ENGINE_MOVERS.get(seat.difficulty or "normal", ENGINE_MOVERS["normal"])
        move = await anyio.to_thread.run_sync(mover, room.board)
        if move is None or move not in room.board.legal_moves:
            log.warning("Room %s: engine %s declined, using minimax", room.id, seat.difficulty)
            move = await anyio.to_thread.run_sync(minmax_engine.get_move, room.board, 2)
        if move is None:
            break

        room.moves.append(room.board.san(move))
        room.board.push(move)
        room.status = "playing"
        _settle(room)
        played = True

    if played:
        room.touch()
    return played


def resign(room: Room, color: str) -> None:
    if room.status == "finished":
        raise MoveRejected("This game is over")
    if room.seats[color] is None:
        raise MoveRejected("You are not playing")
    room.result = "0-1" if color == "w" else "1-0"
    room.termination = "resigned"
    room.status = "finished"
    room.touch()


def reset(room: Room) -> None:
    room.board = chess.Board()
    room.moves = []
    room.saved = False
    room.result = None
    room.termination = None
    room.status = "playing" if room.both_seats_filled() else "waiting"
    room.touch()
