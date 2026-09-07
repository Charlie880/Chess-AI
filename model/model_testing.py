"""
Self-Play Script for the Novice Chess Move Prediction Model
"""

import chess
import numpy as np
import tensorflow as tf
from tensorflow.keras import models # type: ignore
from pathlib import Path
import logging
import time

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO, 
    format='[%(asctime)s] %(levelname)s: %(message)s', 
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# --- Model and Data Constants ---
# Reverted to the older piece_map for compatibility with your existing model
piece_map = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}
NUM_CHANNELS = 13 # 12 pieces + 1 for turn
SQUARE_NAMES = chess.SQUARE_NAMES

def fen_to_tensor(fen: str) -> np.ndarray:
    """
    Corrected: Converts a FEN string to a 3D numpy tensor with 13 channels
    to be compatible with the existing model.
    """
    try:
        board = chess.Board(fen)
        tensor = np.zeros((8, 8, NUM_CHANNELS), dtype=np.float32)
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece:
                idx = piece_map[piece.symbol()]
                row = 7 - (square // 8)
                col = square % 8
                tensor[row, col, idx] = 1.0
        # Re-added the 13th channel for the player's turn
        tensor[..., 12] = 1.0 if board.turn == chess.WHITE else 0.0
        return tensor
    except Exception as e:
        logger.warning(f"Invalid FEN '{fen}': {e}")
        return np.zeros((8, 8, NUM_CHANNELS), dtype=np.float32)

def predict_move(model, board: chess.Board):
    """
    Predicts the best move for a given board state using the trained model.
    It returns the predicted move as a chess.Move object.
    """
    # Convert the current board state (FEN) to the tensor format the model expects
    fen = board.fen()
    tensor = fen_to_tensor(fen)
    input_tensor = np.expand_dims(tensor, axis=0)
    
    # Get predictions from the model
    from_preds, to_preds = model.predict(input_tensor, verbose=0)
    from_probs = from_preds[0]
    to_probs = to_preds[0]

    # Combine the predictions to find the most likely move
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    best_move_score = -1
    best_move = None
    
    # Iterate through all legal moves to find the one with the highest combined probability
    for move in legal_moves:
        from_square_idx = move.from_square
        to_square_idx = move.to_square
        
        # Calculate the score for this move by multiplying the probabilities
        score = from_probs[from_square_idx] * to_probs[to_square_idx]
        
        if score > best_move_score:
            best_move_score = score
            best_move = move
            
    return best_move

def play_game(model, max_moves=100):
    """
    Simulates a single game of chess where the model plays against itself.
    """
    board = chess.Board()
    moves_played = 0
    logger.info("Starting a new self-play game...")
    logger.info("Initial board state:\n" + str(board))
    
    while not board.is_game_over() and moves_played < max_moves:
        current_turn = "White" if board.turn == chess.WHITE else "Black"
        logger.info(f"--- Move {moves_played + 1} ({current_turn}'s turn) ---")
        
        predicted_move = predict_move(model, board)
        
        if predicted_move is None or predicted_move not in board.legal_moves:
            logger.warning(f"Model predicted an illegal or no move. Game Over.")
            break
        
        logger.info(f"Model predicts: {predicted_move.uci()}")
        board.push(predicted_move)
        
        moves_played += 1
        logger.info("New board state:\n" + str(board))

    # Log the final result
    result = board.result()
    logger.info("Game Over!")
    logger.info(f"Final Result: {result}")
    logger.info(f"Total moves: {moves_played}")
    return result

# This is the custom metric function used during training
def top_k_accuracy(k=5):
    def metric_fn(y_true, y_pred):
        return tf.keras.metrics.sparse_top_k_categorical_accuracy(y_true, y_pred, k=k)
    metric_fn.__name__ = f'top_{k}_accuracy'
    return metric_fn

def main():
    MODEL_PATH = 'novice_chess_model.keras'
    
    if not Path(MODEL_PATH).exists():
        logger.error(f"Model file '{MODEL_PATH}' not found. Please train the model first.")
        return
        
    logger.info(f"Loading model from '{MODEL_PATH}'...")
    try:
        # Added custom_objects to handle the custom metrics
        model = models.load_model(
            MODEL_PATH,
            custom_objects={
                'top_3_accuracy': top_k_accuracy(3),
                'top_5_accuracy': top_k_accuracy(5)
            }
        )
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return

    play_game(model)

if __name__ == "__main__":
    main()