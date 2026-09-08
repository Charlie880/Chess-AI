"""Shared game rooms.

The server owns the board. In single player the client could hold the position
and the API just answered with a move, because the only person it could cheat
was themselves. With two people in a room that stops being true, so every move
is validated here and the position is broadcast from here.

Rooms live in memory: they are conversations, not records. Finished games are
written to Mongo for whichever players were signed in (see routes_rooms).
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


@dataclass
class Seat:
    """One side of the board. Either a person or one of the engines."""

    kind: str  # "human" | "engine"
    name: str
    member_id: str | None = None  # the connection sitting here
    user_id: str | None = None  # set when that person is signed in
    difficulty: str | None = None  # engines only


@dataclass
class Member:
    id: str
    name: str
    user_id: str | None
    socket: object  # WebSocket; typed loosely to keep this module framework-free


@dataclass
class Room:
    id: str
    board: chess.Board = field(default_factory=chess.Board)
    moves: list[str] = field(default_factory=list)
    seats: dict[str, Seat | None] = field(default_factory=lambda: {"w": None, "b": None})
    members: dict[str, Member] = field(default_factory=dict)
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

    def seat_of(self, member_id: str) -> str | None:
        for color, seat in self.seats.items():
            if seat and seat.kind == "human" and seat.member_id == member_id:
                return color
        return None

    def both_seats_filled(self) -> bool:
        return all(self.seats[color] is not None for color in COLORS)

    def snapshot(self, member_id: str | None = None) -> dict:
        """Everything a client needs to draw the room. The move list goes as
        SAN and the client replays it, so there is one description of a
        position rather than two that can drift apart."""
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
                }
                for color, seat in self.seats.items()
            },
            "watchers": [
                member.name
                for member in self.members.values()
                if self.seat_of(member.id) is None
            ],
            "you": {
                "id": member_id,
                "color": self.seat_of(member_id) if member_id else None,
            },
        }


ROOMS: dict[str, Room] = {}


def _prune() -> None:
    cutoff = datetime.now(timezone.utc) - IDLE_ROOM_TTL
    for room_id, room in list(ROOMS.items()):
        if not room.members and room.touched_at < cutoff:
            del ROOMS[room_id]


def create_room() -> Room:
    _prune()
    if len(ROOMS) >= MAX_ROOMS:
        raise RuntimeError("Too many open rooms, try again later")
    # The id is the only thing protecting a room, so it has to be unguessable.
    room = Room(id=secrets.token_urlsafe(9))
    ROOMS[room.id] = room
    return room


def get_room(room_id: str) -> Room | None:
    return ROOMS.get(room_id)


def clean_name(name: str | None, fallback: str = "Guest") -> str:
    name = (name or "").strip()[:MAX_NAME_LENGTH]
    return name or fallback


# --------------------------------------------------------------------- moves --


class MoveRejected(Exception):
    """Raised for anything the mover was not allowed to do."""


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
