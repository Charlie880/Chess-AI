"""Easy mode: a small CNN that scores from-square and to-square independently.

The model is loaded lazily so the API still starts (and Normal/Hard still work)
on a machine without TensorFlow or without the weights file.

Caveat worth knowing: the shipped model was trained on 10k of the 8.1M
available positions for ~20 seconds, and tests at ~5.6% complete-move accuracy.
Its predictions are barely better than chance — legality comes from the filter
below, not from the network. Retrain before treating this as a real engine.
"""

import logging
import os
from pathlib import Path

import chess
import numpy as np

log = logging.getLogger(__name__)

PIECE_MAP = {
    "P": 0, "N": 1, "B": 2, "R": 3, "Q": 4, "K": 5,
    "p": 6, "n": 7, "b": 8, "r": 9, "q": 10, "k": 11,
}
NUM_CHANNELS = 13  # 12 piece planes + 1 side-to-move plane

# Resolved against this file, not the working directory, so uvicorn can be
# started from anywhere.
MODEL_PATH = Path(
    os.environ.get("CNN_MODEL_PATH", Path(__file__).resolve().parent.parent / "novice_chess_model.keras")
)

_model = None
_load_failed = False


def _top_k_accuracy(k: int):
    """Recreated only so Keras can deserialise the metrics saved with the model."""
    import tensorflow as tf

    def metric_fn(y_true, y_pred):
        return tf.keras.metrics.sparse_top_k_categorical_accuracy(y_true, y_pred, k=k)

    metric_fn.__name__ = f"top_{k}_accuracy"
    return metric_fn


def _load():
    global _model, _load_failed
    if _model is not None or _load_failed:
        return _model
    try:
        from tensorflow.keras import models  # noqa: PLC0415  (heavy, import on demand)

        _model = models.load_model(
            MODEL_PATH,
            custom_objects={
                "top_3_accuracy": _top_k_accuracy(3),
                "top_5_accuracy": _top_k_accuracy(5),
            },
        )
        log.info("Loaded CNN model from %s", MODEL_PATH)
    except Exception as exc:
        _load_failed = True
        log.warning("CNN model unavailable (%s): %s", MODEL_PATH, exc)
    return _model


def board_to_tensor(board: chess.Board) -> np.ndarray:
    tensor = np.zeros((8, 8, NUM_CHANNELS), dtype=np.float32)
    for square, piece in board.piece_map().items():
        row = 7 - (square // 8)
        col = square % 8
        tensor[row, col, PIECE_MAP[piece.symbol()]] = 1.0
    tensor[..., 12] = 1.0 if board.turn == chess.WHITE else 0.0
    return tensor


def get_move(board: chess.Board) -> chess.Move | None:
    """Highest-scoring *legal* move, or None if the model can't be used."""
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    model = _load()
    if model is None:
        return None

    from_preds, to_preds = model.predict(
        np.expand_dims(board_to_tensor(board), axis=0), verbose=0
    )
    from_probs, to_probs = from_preds[0], to_preds[0]

    return max(
        legal_moves,
        key=lambda m: from_probs[m.from_square] * to_probs[m.to_square],
    )
