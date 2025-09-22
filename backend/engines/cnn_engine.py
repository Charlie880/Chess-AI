import chess
import numpy as np
import tensorflow as tf
from tensorflow.keras import models # type: ignore
from pathlib import Path

# Same piece map you used for training
piece_map = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}
NUM_CHANNELS = 13  # 12 pieces + 1 for turn

# Load model once on import
MODEL_PATH = Path("novice_chess_model.keras")
if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

def top_k_accuracy(k=5):
    def metric_fn(y_true, y_pred):
        return tf.keras.metrics.sparse_top_k_categorical_accuracy(y_true, y_pred, k=k)
    metric_fn.__name__ = f'top_{k}_accuracy'
    return metric_fn

model = models.load_model(
    MODEL_PATH,
    custom_objects={
        'top_3_accuracy': top_k_accuracy(3),
        'top_5_accuracy': top_k_accuracy(5)
    }
)

def fen_to_tensor(fen: str) -> np.ndarray:
    board = chess.Board(fen)
    tensor = np.zeros((8, 8, NUM_CHANNELS), dtype=np.float32)
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            idx = piece_map[piece.symbol()]
            row = 7 - (square // 8)
            col = square % 8
            tensor[row, col, idx] = 1.0
    tensor[..., 12] = 1.0 if board.turn == chess.WHITE else 0.0
    return tensor

def get_move(board: chess.Board) -> chess.Move:
    fen = board.fen()
    tensor = fen_to_tensor(fen)
    input_tensor = np.expand_dims(tensor, axis=0)

    from_preds, to_preds = model.predict(input_tensor, verbose=0)
    from_probs = from_preds[0]
    to_probs = to_preds[0]

    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    best_move_score = -1
    best_move = None
    for move in legal_moves:
        score = from_probs[move.from_square] * to_probs[move.to_square]
        if score > best_move_score:
            best_move_score = score
            best_move = move
    return best_move
