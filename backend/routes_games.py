"""Game history: one document per game, updated in place as it is played."""

from datetime import datetime, timezone
from typing import Annotated, Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import db
from auth import current_user

router = APIRouter(prefix="/games", tags=["games"])

# A standard game is well under this; the cap only exists so a client cannot
# push an unbounded array into the document.
MAX_MOVES = 800

# Kept next to the storage layer so a saved game reads the same whether it was
# written here or by a room.
ENGINE_LABELS = {"easy": "Neural net", "normal": "Minimax", "hard": "Stockfish"}

Status = Literal["in_progress", "finished"]
Outcome = Literal["win", "loss", "draw"]
Termination = Literal["checkmate", "stalemate", "draw", "resigned"]


class NewGame(BaseModel):
    difficulty: Literal["easy", "normal", "hard"]
    playerColor: Literal["w", "b"]


class GameUpdate(BaseModel):
    """The client owns the position, so it sends the whole state each time.
    Replacing beats appending here: a dropped or duplicated request can't
    corrupt the move list."""

    # Both bounds matter: the list cap stops an unbounded array, and the item
    # cap stops 800 entries of arbitrary size. The longest real SAN is 7 chars.
    moves: list[Annotated[str, Field(max_length=12)]] = Field(
        default_factory=list, max_length=MAX_MOVES
    )
    fen: str = Field(max_length=120)
    status: Status = "in_progress"
    outcome: Outcome | None = None
    result: str | None = Field(default=None, max_length=8)
    termination: Termination | None = None


def _serialize(game: dict) -> dict:
    return {
        "id": str(game["_id"]),
        "difficulty": game.get("difficulty"),
        # Room games are played against a person, so the opponent is a name
        # rather than a difficulty. `.get` keeps games saved before rooms
        # existed readable.
        "mode": game.get("mode", "engine"),
        "opponent": game.get("opponent") or ENGINE_LABELS.get(game.get("difficulty"), "Engine"),
        "playerColor": game["player_color"],
        "moves": game["moves"],
        "fen": game["fen"],
        "status": game["status"],
        "outcome": game.get("outcome"),
        "result": game.get("result"),
        "termination": game.get("termination"),
        "startedAt": game["started_at"].isoformat(),
        "updatedAt": game["updated_at"].isoformat(),
        "finishedAt": game["finished_at"].isoformat() if game.get("finished_at") else None,
    }


async def _owned_game(game_id: str, user: dict) -> dict:
    try:
        oid = ObjectId(game_id)
    except InvalidId:
        raise HTTPException(404, "Game not found")
    # Scope by user_id in the query itself, so another account's id is a 404
    # rather than a document we then have to remember to check.
    game = await db.games().find_one({"_id": oid, "user_id": user["_id"]})
    if game is None:
        raise HTTPException(404, "Game not found")
    return game


@router.post("", status_code=201)
async def create_game(body: NewGame, user: dict = Depends(current_user)):
    now = datetime.now(timezone.utc)
    document = {
        "user_id": user["_id"],
        "mode": "engine",
        "difficulty": body.difficulty,
        "opponent": ENGINE_LABELS[body.difficulty],
        "player_color": body.playerColor,
        "moves": [],
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "status": "in_progress",
        "outcome": None,
        "result": None,
        "termination": None,
        "started_at": now,
        "updated_at": now,
        "finished_at": None,
    }
    result = await db.games().insert_one(document)
    document["_id"] = result.inserted_id
    return _serialize(document)


@router.put("/{game_id}")
async def update_game(game_id: str, body: GameUpdate, user: dict = Depends(current_user)):
    game = await _owned_game(game_id, user)
    if game["status"] == "finished":
        raise HTTPException(409, "That game is already finished")

    now = datetime.now(timezone.utc)
    update = {
        "moves": body.moves,
        "fen": body.fen,
        "status": body.status,
        "outcome": body.outcome,
        "result": body.result,
        "termination": body.termination,
        "updated_at": now,
    }
    if body.status == "finished":
        update["finished_at"] = now

    await db.games().update_one({"_id": game["_id"]}, {"$set": update})
    return _serialize({**game, **update})


@router.get("/stats")
async def stats(user: dict = Depends(current_user)):
    """Win/loss/draw split, plus totals. Declared before /{game_id} so the
    literal path is not swallowed by the parameterised one."""
    pipeline = [
        {"$match": {"user_id": user["_id"], "status": "finished"}},
        {"$group": {"_id": "$outcome", "count": {"$sum": 1}}},
    ]
    counts = {"win": 0, "loss": 0, "draw": 0}
    async for row in await db.games().aggregate(pipeline):
        if row["_id"] in counts:
            counts[row["_id"]] = row["count"]

    total = await db.games().count_documents({"user_id": user["_id"]})
    return {**counts, "finished": sum(counts.values()), "total": total}


@router.get("")
async def list_games(
    user: dict = Depends(current_user),
    limit: int = Query(default=25, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
):
    cursor = db.games().find({"user_id": user["_id"]}).sort("started_at", -1).skip(skip).limit(limit)
    return [_serialize(game) async for game in cursor]


@router.get("/{game_id}")
async def get_game(game_id: str, user: dict = Depends(current_user)):
    return _serialize(await _owned_game(game_id, user))
