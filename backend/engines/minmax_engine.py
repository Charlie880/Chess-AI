"""Depth-limited minimax with alpha-beta pruning. Used for Normal mode, and as
the last-resort fallback for Hard when no real engine is reachable."""

import chess

# Centipawns. King has no material value; being mated is scored separately.
PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}

MATE = 100_000


def evaluate_board(board: chess.Board) -> int:
    """Material balance in centipawns. Positive favours white."""
    score = 0
    for piece_type, value in PIECE_VALUES.items():
        score += len(board.pieces(piece_type, chess.WHITE)) * value
        score -= len(board.pieces(piece_type, chess.BLACK)) * value
    return score


def terminal_score(board: chess.Board, depth: int) -> int:
    """Score a finished position. `depth` is the plies still left in the budget,
    so a mate found earlier in the search outranks the same mate found later —
    without it the engine will happily stall a forced win forever."""
    if board.is_checkmate():
        # The side to move has been mated.
        return -(MATE + depth) if board.turn == chess.WHITE else (MATE + depth)
    return 0  # stalemate, insufficient material, repetition, 50-move


def _ordered_moves(board: chess.Board):
    """Captures first. Cheap ordering, but it is what makes alpha-beta bite."""
    return sorted(board.legal_moves, key=board.is_capture, reverse=True)


def minimax(board: chess.Board, depth: int, alpha: float, beta: float,
            maximizing: bool) -> tuple[int, chess.Move | None]:
    if board.is_game_over():
        return terminal_score(board, depth), None
    if depth == 0:
        return evaluate_board(board), None

    best_move = None

    if maximizing:
        best = float("-inf")
        for move in _ordered_moves(board):
            board.push(move)
            score, _ = minimax(board, depth - 1, alpha, beta, False)
            board.pop()
            if score > best:
                best, best_move = score, move
            alpha = max(alpha, best)
            if alpha >= beta:
                break
    else:
        best = float("inf")
        for move in _ordered_moves(board):
            board.push(move)
            score, _ = minimax(board, depth - 1, alpha, beta, True)
            board.pop()
            if score < best:
                best, best_move = score, move
            beta = min(beta, best)
            if alpha >= beta:
                break

    return best, best_move


def get_move(board: chess.Board, depth: int = 3) -> chess.Move | None:
    _, best_move = minimax(
        board, depth, float("-inf"), float("inf"), board.turn == chess.WHITE
    )
    return best_move
