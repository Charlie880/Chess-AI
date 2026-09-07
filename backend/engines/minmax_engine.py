import chess

# Simple piece values
PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0  # King is invaluable
}

def evaluate_board(board: chess.Board) -> int:
    """Basic material evaluation: positive = white advantage, negative = black advantage"""
    eval = 0
    for piece_type in PIECE_VALUES:
        eval += len(board.pieces(piece_type, chess.WHITE)) * PIECE_VALUES[piece_type]
        eval -= len(board.pieces(piece_type, chess.BLACK)) * PIECE_VALUES[piece_type]
    return eval

def minimax(board: chess.Board, depth: int, maximizing: bool) -> tuple[int, chess.Move | None]:
    """Return (score, best_move)"""
    if depth == 0 or board.is_game_over():
        return evaluate_board(board), None

    best_move = None

    if maximizing:
        max_eval = float('-inf')
        for move in board.legal_moves:
            board.push(move)
            eval, _ = minimax(board, depth - 1, False)
            board.pop()
            if eval > max_eval:
                max_eval = eval
                best_move = move
        return max_eval, best_move
    else:
        min_eval = float('inf')
        for move in board.legal_moves:
            board.push(move)
            eval, _ = minimax(board, depth - 1, True)
            board.pop()
            if eval < min_eval:
                min_eval = eval
                best_move = move
        return min_eval, best_move

def get_move(board: chess.Board, depth: int = 2) -> chess.Move:
    """Get best move for current turn using minimax"""
    _, best_move = minimax(board, depth, board.turn == chess.WHITE)
    return best_move