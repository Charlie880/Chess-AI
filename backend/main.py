"""Chess engine API. One endpoint, three pluggable engines behind a difficulty flag."""

import logging
from contextlib import asynccontextmanager

import chess
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
import routes_auth
import routes_games
from config import PERSISTENCE_ENABLED
from engines import cnn_engine, minmax_engine, stockfish_engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("chess-api")

@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    yield
    await db.close()
    stockfish_engine.shutdown()


app = FastAPI(title="Chess Engine API", lifespan=lifespan)

# The Next.js route handler proxies server-side and doesn't need this, but it
# lets the API be hit directly from a browser during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
)

ENGINES = {
    "easy": cnn_engine.get_move,
    "normal": lambda board: minmax_engine.get_move(board, depth=2),
    "hard": stockfish_engine.get_move,
}


class MoveRequest(BaseModel):
    fen: str
    difficulty: str = "normal"


app.include_router(routes_auth.router)
app.include_router(routes_games.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "engines": sorted(ENGINES),
        "persistence": PERSISTENCE_ENABLED and db.database() is not None,
    }


@app.post("/move")
def make_move(request: MoveRequest):
    engine = ENGINES.get(request.difficulty)
    if engine is None:
        raise HTTPException(400, f"Unknown difficulty '{request.difficulty}'")

    try:
        board = chess.Board(request.fen)
    except ValueError:
        raise HTTPException(400, "Invalid FEN provided")

    if board.is_game_over():
        raise HTTPException(400, f"Game is already over: {board.result()}")

    try:
        move = engine(board)
    except Exception:
        # Logged in full above; the client gets a fixed string, because
        # exception text here can carry filesystem paths from the engine.
        log.exception("Engine '%s' raised", request.difficulty)
        raise HTTPException(502, "The engine failed to produce a move")

    # An engine may decline (CNN with no model, search with no result). Minimax
    # is always available, so fall back to it rather than failing the request.
    # The response says which engine actually moved, so the UI can stop
    # claiming you are playing a neural net that never loaded.
    engine_used = request.difficulty
    if move is None or move not in board.legal_moves:
        if move is not None:
            log.warning("Engine '%s' returned illegal move %s", request.difficulty, move.uci())
        else:
            log.warning("Engine '%s' declined to move, falling back to minimax", request.difficulty)
        move = minmax_engine.get_move(board, depth=2)
        engine_used = "normal"
    if move is None:
        raise HTTPException(500, "No legal move could be produced")

    san = board.san(move)  # must be computed before the push
    board.push(move)

    return {
        "move": move.uci(),
        "from": chess.square_name(move.from_square),
        "to": chess.square_name(move.to_square),
        "promotion": chess.piece_symbol(move.promotion) if move.promotion else None,
        "san": san,
        "fen": board.fen(),
        "engine": engine_used,
        "gameOver": board.is_game_over(),
        "result": board.result() if board.is_game_over() else None,
    }
