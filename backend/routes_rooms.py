"""Room REST endpoints and the live WebSocket channel."""

import asyncio
import logging
import secrets
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

import db
import matchmaking
import rooms
from auth import Identity, create_ws_ticket, current_identity, read_ws_ticket
from rooms import COLORS, MoveRejected, Room

log = logging.getLogger(__name__)
router = APIRouter(tags=["rooms"])

ENGINE_LABELS = {"easy": "Neural net", "normal": "Minimax", "hard": "Stockfish"}


def require_account(identity: Identity) -> Identity:
    """Seats and rooms need a real account: a guest has no stable identity to
    award a game to, and a recorded result with nobody behind it is worth
    nothing. Watching stays open to anyone."""
    if identity.kind != "user":
        raise HTTPException(403, "Sign in to play against another person")
    return identity


# -------------------------------------------------------------------- rooms --


@router.post("/rooms", status_code=201)
def create_room(identity: Identity = Depends(current_identity)):
    require_account(identity)
    try:
        room = rooms.create_room(host_id=identity.id)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    return {"id": room.id}


@router.get("/rooms/{room_id}")
def room_exists(room_id: str):
    room = rooms.get_room(room_id)
    if room is None:
        raise HTTPException(404, "That room does not exist, or it has expired")
    snapshot = room.snapshot()
    return {"id": room.id, "status": room.status, "seats": snapshot["seats"]}


@router.post("/rooms/ticket")
def issue_ticket(identity: Identity = Depends(current_identity)):
    """Exchanges a session for a short-lived token the browser can hand to the
    WebSocket, so a room knows who sat down without the page ever holding the
    session token itself. Guests get one too - they can watch."""
    return {"ticket": create_ws_ticket(identity), "name": identity.name, "kind": identity.kind}


# ------------------------------------------------------------------ invites --


class NewInvite(BaseModel):
    kind: str = Field(default="play", pattern="^(play|watch)$")


@router.post("/rooms/{room_id}/invites", status_code=201)
def create_invite(room_id: str, body: NewInvite, identity: Identity = Depends(current_identity)):
    require_account(identity)
    room = rooms.get_room(room_id)
    if room is None:
        raise HTTPException(404, "That room does not exist, or it has expired")
    try:
        invite = rooms.make_invite(room, body.kind, identity.id)
    except MoveRejected as exc:
        raise HTTPException(403, str(exc))
    return {"token": invite.token, "kind": invite.kind, "roomId": room.id}


@router.get("/invites/{token}")
async def read_invite(token: str, identity: Identity = Depends(current_identity)):
    """What this link is worth, before anyone opens a socket.

    Resolving here rather than on connect is what lets the page say "this
    invitation is no longer valid" without joining first - and lets the host be
    told their invitation arrived too late.
    """
    invite = rooms.find_invite(token)
    if invite is None:
        return {"status": "gone", "kind": None, "roomId": None}

    status = rooms.invite_status(invite, identity.id)
    room = rooms.get_room(invite.room_id)

    if status == "taken" and room is not None:
        await _tell_host(room, invite.created_by, {
            "type": "inviteRejected",
            "name": identity.name,
            "message": f"{identity.name} opened your invitation, but both seats were taken.",
        })

    return {
        "status": status,
        "kind": invite.kind,
        "roomId": invite.room_id,
        # A play invitation that arrived too late is still fine to watch with.
        "canWatch": status != "gone",
    }


# ------------------------------------------------------------- quick play --


@router.post("/matchmaking")
def matchmaking_join(identity: Identity = Depends(current_identity)):
    require_account(identity)
    return matchmaking.join(identity.id, identity.name)


@router.get("/matchmaking")
def matchmaking_poll(identity: Identity = Depends(current_identity)):
    require_account(identity)
    return matchmaking.poll(identity.id)


@router.delete("/matchmaking")
def matchmaking_leave(identity: Identity = Depends(current_identity)):
    require_account(identity)
    return matchmaking.leave(identity.id)


# ------------------------------------------------------------------ helpers --


async def _broadcast(room: Room, message: dict | None = None) -> None:
    """Push to everyone. With no message each client gets its own snapshot,
    because "is this seat you" differs per viewer. Dead sockets are dropped
    rather than allowed to break the loop for everybody else."""
    for member in list(room.members.values()):
        try:
            await member.socket.send_json(message or room.snapshot(member.id))
        except Exception:
            room.members.pop(member.id, None)


async def _tell_host(room: Room, host_id: str, message: dict) -> None:
    for member in list(room.members.values()):
        if member.owner_id != host_id:
            continue
        try:
            await member.socket.send_json(message)
        except Exception:
            room.members.pop(member.id, None)


async def _save_chat(room: Room, message: dict) -> None:
    """Chat is broadcast live and stored afterwards. Delivery must not depend
    on the database being up."""
    messages = db.messages()
    if messages is None:
        return
    try:
        await messages.insert_one({
            "room_id": room.id,
            "owner_id": message["ownerId"],
            "name": message["name"],
            "text": message["text"],
            "at": datetime.now(timezone.utc),
        })
    except Exception:
        log.exception("Could not store a chat message for room %s", room.id)


async def _save_finished_game(room: Room) -> None:
    """Record the game for each player. Guests never hold a seat, so every
    finished game has two real owners."""
    if db.games() is None or room.status != "finished" or room.saved:
        return
    room.saved = True

    now = datetime.now(timezone.utc)
    for color in COLORS:
        seat = room.seats[color]
        if seat is None or seat.kind != "human" or not seat.owner_id:
            continue

        other = room.seats["b" if color == "w" else "w"]
        won = None if room.result == "1/2-1/2" else (room.result == "1-0") == (color == "w")

        try:
            await db.games().insert_one({
                "user_id": ObjectId(seat.owner_id),
                "mode": "room",
                "room_id": room.id,
                "opponent": other.name if other else "Nobody",
                "difficulty": other.difficulty if other and other.kind == "engine" else None,
                "player_color": color,
                "moves": list(room.moves),
                "move_times": list(room.move_times),
                "white_name": room.seats["w"].name if room.seats["w"] else "Nobody",
                "black_name": room.seats["b"].name if room.seats["b"] else "Nobody",
                "fen": room.board.fen(),
                "status": "finished",
                "outcome": "draw" if won is None else ("win" if won else "loss"),
                "result": room.result,
                "termination": room.termination,
                "started_at": room.game_started_at,
                "updated_at": now,
                "finished_at": now,
            })
        except Exception:
            log.exception("Could not record room game for %s", seat.owner_id)


async def _forfeit_when_grace_runs_out(room: Room, color: str) -> None:
    """Hold the seat, then award the game if they never came back."""
    await asyncio.sleep(rooms.GRACE_SECONDS + 0.5)
    async with room.lock:
        if not rooms.forfeit_absent(room, color):
            return
    await _broadcast(room)
    await _save_finished_game(room)


# ---------------------------------------------------------------- websocket --


@router.websocket("/rooms/{room_id}/ws")
async def room_socket(websocket: WebSocket, room_id: str):
    room = rooms.get_room(room_id)
    if room is None:
        await websocket.close(code=4404, reason="No such room")
        return

    await websocket.accept()
    member_id = secrets.token_urlsafe(8)

    try:
        opening = await websocket.receive_json()
        if opening.get("type") != "join":
            await websocket.close(code=4400, reason="Expected a join")
            return

        # A room is tied to identity: no valid ticket, no seat and no view.
        identity = read_ws_ticket(opening.get("ticket"))
        if identity is None:
            await websocket.close(code=4401, reason="Sign in or reload to get an identity")
            return

        member = rooms.Member(
            id=member_id,
            name=rooms.clean_name(opening.get("name"), fallback=identity.name),
            owner_kind=identity.kind,
            owner_id=identity.id,
            socket=websocket,
        )

        async with room.lock:
            room.members[member_id] = member
            room.touch()
            # Coming back to a seat you already hold beats asking for one: a
            # refresh mid-game should drop you straight back in.
            held = room.seat_for_owner(identity.id)
            if held is not None:
                rooms.claim_seat(room, held, member)
            elif opening.get("role") == "play" and identity.kind == "user":
                free = room.open_seat()
                if free is not None:
                    rooms.claim_seat(room, free, member)
            played = await rooms.play_engine_moves(room)
        await _broadcast(room)
        if played and room.status == "finished":
            await _save_finished_game(room)

        while True:
            message = await websocket.receive_json()
            kind = message.get("type")
            chatted = None

            try:
                async with room.lock:
                    if kind == "move":
                        color = room.seat_of(member_id)
                        if color is None:
                            raise MoveRejected("You are watching this game")
                        rooms.apply_move(room, color, str(message.get("uci", "")))
                        await rooms.play_engine_moves(room)

                    elif kind == "sit":
                        rooms.claim_seat(room, str(message.get("color", "")), member)
                        await rooms.play_engine_moves(room)

                    elif kind == "stand":
                        rooms.stand(room, member_id)

                    elif kind == "engine":
                        color = str(message.get("color", ""))
                        difficulty = str(message.get("difficulty", "normal"))
                        if difficulty not in ENGINE_LABELS:
                            raise MoveRejected("There is no such engine")
                        rooms.seat_engine(room, color, difficulty, ENGINE_LABELS[difficulty])
                        await rooms.play_engine_moves(room)

                    elif kind == "clearSeat":
                        rooms.clear_seat(room, str(message.get("color", "")))

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

                    elif kind == "chat":
                        chatted = rooms.add_chat(room, member, str(message.get("text", "")))

                    else:
                        raise MoveRejected("Unknown request")

            except MoveRejected as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
                continue

            if chatted is not None:
                # Chat does not change the board, so it does not need a state
                # broadcast - and a 50-message tail on every move would be waste.
                await _broadcast(room, {"type": "chat", "message": chatted})
                await _save_chat(room, chatted)
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
            away = rooms.mark_away(room, member_id)
            room.touch()
        await _broadcast(room)
        if away is not None:
            asyncio.create_task(_forfeit_when_grace_runs_out(room, away))
