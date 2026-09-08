"""Room REST endpoints and the live WebSocket channel."""

import logging
import secrets
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

import db
import rooms
from auth import create_ws_ticket, current_user, read_ws_ticket
from rooms import COLORS, MoveRejected, Room, Seat

log = logging.getLogger(__name__)
router = APIRouter(tags=["rooms"])

ENGINE_LABELS = {"easy": "Neural net", "normal": "Minimax", "hard": "Stockfish"}


class NewRoom(BaseModel):
    name: str | None = Field(default=None, max_length=rooms.MAX_NAME_LENGTH)


@router.post("/rooms", status_code=201)
def create_room(_: NewRoom | None = None):
    try:
        room = rooms.create_room()
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    return {"id": room.id}


@router.get("/rooms/{room_id}")
def room_exists(room_id: str):
    room = rooms.get_room(room_id)
    if room is None:
        raise HTTPException(404, "That room does not exist, or it has expired")
    return {"id": room.id, "status": room.status, "seats": room.snapshot()["seats"]}


@router.post("/rooms/ticket")
def issue_ticket(user: dict = Depends(current_user)):
    """Exchanges a session for a short-lived token the browser can hand to the
    WebSocket, so a room knows who sat down without the page ever holding the
    session token itself."""
    return {"ticket": create_ws_ticket(str(user["_id"]))}


# ------------------------------------------------------------------ helpers --


async def _broadcast(room: Room) -> None:
    """Push the position to everyone. Each client gets its own snapshot because
    "is this seat you" differs per viewer. Dead sockets are dropped rather than
    allowed to break the loop for everybody else."""
    for member in list(room.members.values()):
        try:
            await member.socket.send_json(room.snapshot(member.id))
        except Exception:
            room.members.pop(member.id, None)


async def _save_finished_game(room: Room) -> None:
    """Record the game for whichever players were signed in. Guests leave no
    trace, which is the deal they took by not signing in."""
    if db.games() is None or room.status != "finished" or room.saved:
        return
    room.saved = True

    now = datetime.now(timezone.utc)
    for color in COLORS:
        seat = room.seats[color]
        if seat is None or seat.kind != "human" or not seat.user_id:
            continue

        other = room.seats["b" if color == "w" else "w"]
        if room.termination == "resigned":
            # The loser is whoever the result says lost.
            won = (room.result == "1-0") == (color == "w")
        elif room.result == "1/2-1/2":
            won = None
        else:
            won = (room.result == "1-0") == (color == "w")

        try:
            await db.games().insert_one(
                {
                    "user_id": ObjectId(seat.user_id),
                    "mode": "room",
                    "room_id": room.id,
                    "opponent": other.name if other else "Nobody",
                    "difficulty": other.difficulty if other and other.kind == "engine" else None,
                    "player_color": color,
                    "moves": list(room.moves),
                    "fen": room.board.fen(),
                    "status": "finished",
                    "outcome": "draw" if won is None else ("win" if won else "loss"),
                    "result": room.result,
                    "termination": room.termination,
                    "started_at": room.created_at,
                    "updated_at": now,
                    "finished_at": now,
                }
            )
        except Exception:
            log.exception("Could not record room game for %s", seat.user_id)


def _seat_human(room: Room, color: str, member) -> None:
    if color not in COLORS:
        raise MoveRejected("There is no such seat")
    if room.seats[color] is not None:
        raise MoveRejected("That seat is taken")
    if room.seat_of(member.id) is not None:
        raise MoveRejected("You are already playing")
    room.seats[color] = Seat(
        kind="human", name=member.name, member_id=member.id, user_id=member.user_id
    )
    if room.both_seats_filled() and room.status == "waiting":
        room.status = "playing"


def _seat_engine(room: Room, color: str, difficulty: str) -> None:
    if color not in COLORS:
        raise MoveRejected("There is no such seat")
    if difficulty not in ENGINE_LABELS:
        raise MoveRejected("There is no such engine")
    if room.seats[color] is not None:
        raise MoveRejected("That seat is taken")
    room.seats[color] = Seat(
        kind="engine", name=ENGINE_LABELS[difficulty], difficulty=difficulty
    )
    if room.both_seats_filled() and room.status == "waiting":
        room.status = "playing"


def _stand(room: Room, member_id: str) -> None:
    color = room.seat_of(member_id)
    if color is None:
        raise MoveRejected("You are not sitting down")
    if room.moves:
        raise MoveRejected("You cannot leave a game in progress. Resign instead.")
    room.seats[color] = None
    room.status = "waiting"


def _clear_seat(room: Room, color: str) -> None:
    """Only allowed for engine seats, and only before a game starts."""
    seat = room.seats.get(color)
    if seat is None or seat.kind != "engine":
        raise MoveRejected("There is no engine in that seat")
    if room.moves:
        raise MoveRejected("A game is already under way")
    room.seats[color] = None
    room.status = "waiting"


# ---------------------------------------------------------------- websocket --


@router.websocket("/rooms/{room_id}/ws")
async def room_socket(websocket: WebSocket, room_id: str):
    room = rooms.get_room(room_id)
    if room is None:
        await websocket.close(code=4404, reason="No such room")
        return

    await websocket.accept()

    member_id = secrets.token_urlsafe(8)
    member = None

    try:
        # First message must be the join, so the room knows who this is.
        opening = await websocket.receive_json()
        if opening.get("type") != "join":
            await websocket.close(code=4400, reason="Expected a join")
            return

        user_id = read_ws_ticket(opening.get("ticket"))
        name = rooms.clean_name(opening.get("name"), fallback=f"Guest {member_id[:4]}")
        member = rooms.Member(id=member_id, name=name, user_id=user_id, socket=websocket)

        async with room.lock:
            room.members[member_id] = member
            room.touch()
            # Sit down if asked and there is room; otherwise watch.
            if opening.get("role") == "play":
                for color in COLORS:
                    if room.seats[color] is None:
                        _seat_human(room, color, member)
                        break
            played = await rooms.play_engine_moves(room)
        await _broadcast(room)
        if played and room.status == "finished":
            await _save_finished_game(room)

        while True:
            message = await websocket.receive_json()
            kind = message.get("type")

            try:
                async with room.lock:
                    if kind == "move":
                        color = room.seat_of(member_id)
                        if color is None:
                            raise MoveRejected("You are watching this game")
                        rooms.apply_move(room, color, str(message.get("uci", "")))
                        await rooms.play_engine_moves(room)

                    elif kind == "sit":
                        _seat_human(room, str(message.get("color", "")), member)
                        await rooms.play_engine_moves(room)

                    elif kind == "stand":
                        _stand(room, member_id)

                    elif kind == "engine":
                        _seat_engine(
                            room,
                            str(message.get("color", "")),
                            str(message.get("difficulty", "normal")),
                        )
                        await rooms.play_engine_moves(room)

                    elif kind == "clearSeat":
                        _clear_seat(room, str(message.get("color", "")))

                    elif kind == "resign":
                        color = room.seat_of(member_id)
                        if color is None:
                            raise MoveRejected("You are watching this game")
                        rooms.resign(room, color)

                    elif kind == "newGame":
                        if room.seat_of(member_id) is None:
                            raise MoveRejected("Only the players can start a new game")
                        rooms.reset(room)
                        await rooms.play_engine_moves(room)

                    else:
                        raise MoveRejected("Unknown request")

            except MoveRejected as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
                continue

            await _broadcast(room)
            if room.status == "finished":
                await _save_finished_game(room)

    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("Room %s socket failed", room_id)
    finally:
        async with room.lock:
            room.members.pop(member_id, None)
            # Free a seat only if no game has started; mid-game the seat is
            # held so a refresh does not hand it to a stranger.
            color = room.seat_of(member_id)
            if color and not room.moves:
                room.seats[color] = None
                room.status = "waiting"
            room.touch()
        await _broadcast(room)
