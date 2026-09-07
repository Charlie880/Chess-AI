"""
Novice-Level Chess Move Prediction Model with Full Metrics + Logging
"""

import os
import time
import logging
import numpy as np
import pandas as pd
import chess
import tensorflow as tf
from tensorflow.keras import layers, models, callbacks # type: ignore
from sklearn.model_selection import train_test_split
from pathlib import Path

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO, 
    format='[%(asctime)s] %(levelname)s: %(message)s', 
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

np.random.seed(42)
tf.random.set_seed(42)

SQUARE_NAMES = chess.SQUARE_NAMES
NUM_SQUARES = 64

class Config:
    BATCH_SIZE = 128
    EPOCHS = 20
    LEARNING_RATE = 0.001
    VALIDATION_SPLIT = 0.05
    TEST_SPLIT = 0.05
    # Refactored: Set data sample size to 500,000
    DATA_SAMPLE_SIZE = 500000

piece_map = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}

def fen_to_tensor(fen: str) -> np.ndarray:
    """Converts a single FEN string to a 3D numpy tensor."""
    try:
        board = chess.Board(fen)
        tensor = np.zeros((8, 8, 13), dtype=np.float32)
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece:
                idx = piece_map[piece.symbol()]
                row = 7 - (square // 8)
                col = square % 8
                tensor[row, col, idx] = 1.0
        tensor[..., 12] = 1.0 if board.turn == chess.WHITE else 0.0
        return tensor
    except Exception as e:
        logger.warning(f"Invalid FEN '{fen}': {e}")
        return np.zeros((8, 8, 13), dtype=np.float32)

def move_to_labels(move: str) -> tuple:
    """Converts a single move string to from/to square labels."""
    if not isinstance(move, str) or len(move) < 4:
        return -1, -1
    try:
        return SQUARE_NAMES.index(move[:2]), SQUARE_NAMES.index(move[2:4])
    except Exception as e:
        logger.debug(f"Invalid move '{move}': {e}")
        return -1, -1

def load_and_preprocess_data(data_path: str, sample_size: int = None):
    """
    Loads data, cleans it, and handles sampling.
    Refactored: Uses nrows to read only the desired sample size from the file.
    """
    logger.info(f"Loading data from {data_path}...")
    if not Path(data_path).exists():
        raise FileNotFoundError(f"Data file not found: {data_path}")
    
    # Read only the first `sample_size` rows for efficiency
    nrows = sample_size if sample_size else None
    df = pd.read_csv(data_path, nrows=nrows)
    logger.info(f"Loaded {len(df)} rows")
    
    df = df.dropna(subset=['fen', 'move'])
    df = df[df['move'].apply(lambda x: isinstance(x, str) and len(x) >= 4)]
    logger.info(f"After cleaning: {len(df)} rows")

    move_labels = df['move'].apply(move_to_labels)
    valid_mask = move_labels.apply(lambda x: x[0] != -1 and x[1] != -1)
    df_valid = df[valid_mask].copy()
    logger.info(f"Valid moves: {len(df_valid)}/{len(df)} ({len(df_valid)/len(df)*100:.1f}%)")
    
    return df_valid

def create_tensorflow_dataset(df, batch_size, shuffle=True):
    """
    Refactored: Converts data to TensorFlow dataset using vectorized operations for efficiency.
    """
    logger.info("Converting to TensorFlow dataset...")

    # Apply functions to the entire series, which is much faster than a loop
    tensors = np.array(df['fen'].apply(fen_to_tensor).tolist(), dtype=np.float32)
    move_labels = df['move'].apply(move_to_labels)
    from_labels = np.array(move_labels.apply(lambda x: x[0]).tolist(), dtype=np.int32)
    to_labels = np.array(move_labels.apply(lambda x: x[1]).tolist(), dtype=np.int32)

    logger.info(f"Final dataset size: {len(tensors)} positions")
    
    dataset = tf.data.Dataset.from_tensor_slices((tensors, {'from_output': from_labels, 'to_output': to_labels}))
    if shuffle:
        # Increased shuffle buffer size to accommodate more data
        dataset = dataset.shuffle(buffer_size=min(50000, len(tensors)), seed=42)
    dataset = dataset.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return dataset


def build_novice_model():
    logger.info("Building novice chess model...")
    inputs = layers.Input(shape=(8, 8, 13))
    x = layers.Conv2D(32, 3, activation='relu', padding='same')(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D()(x)
    
    x = layers.Conv2D(64, 3, activation='relu', padding='same')(x)
    x = layers.BatchNormalization()(x)
    x = layers.GlobalAveragePooling2D()(x)
    
    x = layers.Dense(256, activation='relu')(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation='relu')(x)
    
    from_output = layers.Dense(NUM_SQUARES, activation='softmax', name='from_output')(x)
    to_output = layers.Dense(NUM_SQUARES, activation='softmax', name='to_output')(x)
    
    model = models.Model(inputs=inputs, outputs=[from_output, to_output], name='NoviceChessModel')
    logger.info(f"Model created with {model.count_params():,} parameters")
    return model

def top_k_accuracy(k=5):
    def metric_fn(y_true, y_pred):
        return tf.keras.metrics.sparse_top_k_categorical_accuracy(y_true, y_pred, k=k)
    metric_fn.__name__ = f'top_{k}_accuracy'
    return metric_fn

def evaluate_full_metrics(model, dataset):
    logger.info("Evaluating model on test dataset...")
    all_from_preds, all_to_preds, all_from_true, all_to_true = [], [], [], []

    for X_batch, y_batch in dataset:
        from_pred, to_pred = model.predict(X_batch, verbose=0)
        all_from_preds.append(from_pred)
        all_to_preds.append(to_pred)
        all_from_true.append(y_batch['from_output'].numpy())
        all_to_true.append(y_batch['to_output'].numpy())
    
    from_preds = np.concatenate(all_from_preds)
    to_preds = np.concatenate(all_to_preds)
    from_true = np.concatenate(all_from_true)
    to_true = np.concatenate(all_to_true)
    
    from_classes = np.argmax(from_preds, axis=1)
    to_classes = np.argmax(to_preds, axis=1)
    
    complete_accuracy = np.mean((from_classes == from_true) & (to_classes == to_true))
    
    def topk(y_true, y_pred, k=3):
        topk_preds = np.argsort(y_pred, axis=1)[:, -k:]
        return np.mean([true in pred_k for true, pred_k in zip(y_true, topk_preds)])
    
    metrics = {
        'complete_accuracy': complete_accuracy,
        'from_top1': np.mean(from_classes == from_true),
        'from_top3': topk(from_true, from_preds, 3),
        'from_top5': topk(from_true, from_preds, 5),
        'to_top1': np.mean(to_classes == to_true),
        'to_top3': topk(to_true, to_preds, 3),
        'to_top5': topk(to_true, to_preds, 5),
        'from_confidence': np.mean(np.max(from_preds, axis=1)),
        'to_confidence': np.mean(np.max(to_preds, axis=1))
    }

    logger.info("📊 Full Metrics Report")
    for k, v in metrics.items():
        logger.info(f"{k}: {v:.4f}")
    
    return metrics

def main():
    config = Config()
    DATA_PATH = 'chess_data.csv'  # Update as needed

    logger.info("Starting training pipeline...")
    df = load_and_preprocess_data(DATA_PATH, config.DATA_SAMPLE_SIZE)

    train_df, temp_df = train_test_split(df, test_size=config.VALIDATION_SPLIT + config.TEST_SPLIT, random_state=42)
    val_df, test_df = train_test_split(temp_df, test_size=config.TEST_SPLIT/(config.VALIDATION_SPLIT + config.TEST_SPLIT), random_state=42)
    logger.info(f"Data split - Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")

    train_ds = create_tensorflow_dataset(train_df, config.BATCH_SIZE)
    val_ds = create_tensorflow_dataset(val_df, config.BATCH_SIZE, shuffle=False)
    test_ds = create_tensorflow_dataset(test_df, config.BATCH_SIZE, shuffle=False)

    model = build_novice_model()
    model.compile(
        optimizer=tf.keras.optimizers.Adam(config.LEARNING_RATE),
        loss={'from_output': 'sparse_categorical_crossentropy', 'to_output': 'sparse_categorical_crossentropy'},
        loss_weights={'from_output': 0.5, 'to_output': 0.5},
        metrics={'from_output': ['accuracy', top_k_accuracy(3), top_k_accuracy(5)],
                 'to_output': ['accuracy', top_k_accuracy(3), top_k_accuracy(5)]}
    )

    callbacks_list = [
        callbacks.EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True, verbose=1),
        callbacks.ModelCheckpoint('novice_chess_model.keras', save_best_only=True, monitor='val_loss', verbose=1)
    ]

    start_time = time.time()
    history = model.fit(train_ds, validation_data=val_ds, epochs=config.EPOCHS, callbacks=callbacks_list, verbose=1)
    logger.info(f"Training completed in {time.time()-start_time:.2f} seconds")

    metrics = evaluate_full_metrics(model, test_ds)
    model.save('novice_chess_model_final.keras')
    logger.info("Model saved as 'novice_chess_model_final.keras'")

    return model, history, metrics

if __name__ == "__main__":
    model, history, metrics = main()