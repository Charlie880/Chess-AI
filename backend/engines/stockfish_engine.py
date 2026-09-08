"""Hard mode.

Three tiers, tried in order, because none of them is available everywhere:

1. A local Stockfish binary (strongest; set STOCKFISH_PATH or put it on PATH).
2. Lichess cloud eval — a *cache*, not an engine. It only knows positions
   somebody already analysed, so it 404s on most positions past the opening.
3. Minimax, so Hard degrades instead of returning a 500 mid-game.
"""

import logging
import os
import shutil

import chess
import chess.engine
import requests

from . import minmax_engine

log = logging.getLogger(__name__)

LICHESS_API_URL = "https://lichess.org/api/cloud-eval"
FALLBACK_DEPTH = 3

_local_engine = None
_local_engine_checked = False


def _binary_path() -> str | None:
    return os.environ.get("STOCKFISH_PATH") or shutil.which("stockfish")


def _local() -> chess.engine.SimpleEngine | None:
    """Open the local binary once and keep it; None if there isn't one."""
    global _local_engine, _local_engine_checked
    if _local_engine_checked:
        return _local_engine
    _local_engine_checked = True

    path = _binary_path()
    if path:
        try:
            _local_engine = chess.engine.SimpleEngine.popen_uci(path)
            log.info("Using local Stockfish at %s", path)
        except Exception as exc:
            log.warning("Local Stockfish at %s failed to start: %s", path, exc)
    return _local_engine


def _from_cloud(board: chess.Board, depth: int) -> chess.Move | None:
    try:
        response = requests.get(
            LICHESS_API_URL,
            params={"fen": board.fen(), "multiPv": 1},
            timeout=5,
        )
        if response.status_code == 404:
            return None  # position not in the cloud cache; expected, not an error
        response.raise_for_status()
        pvs = response.json().get("pvs") or []
        uci = (pvs[0].get("moves", "") if pvs else "").split(" ")[0]
    except (requests.RequestException, ValueError, IndexError) as exc:
        log.warning("Lichess cloud eval unavailable: %s", exc)
        return None

    if not uci:
        return None
    try:
        move = chess.Move.from_uci(uci)
    except ValueError:
        return None
    return move if move in board.legal_moves else None


def get_move(board: chess.Board, depth: int = 15) -> chess.Move | None:
    engine = _local()
    if engine:
        try:
            return engine.play(board, chess.engine.Limit(depth=depth)).move
        except Exception as exc:
            log.warning("Local Stockfish failed, falling through: %s", exc)

    move = _from_cloud(board, depth)
    if move:
        return move

    log.info("Hard mode falling back to minimax depth %d", FALLBACK_DEPTH)
    return minmax_engine.get_move(board, depth=FALLBACK_DEPTH)
