import chess
import requests

LICHESS_API_URL = "https://lichess.org/api/cloud-eval"

def get_move(board: chess.Board, depth: int = 15) -> chess.Move:
    """
    Returns the best legal move from Lichess Stockfish cloud evaluation
    """
    fen = board.fen()
    params = {"fen": fen, "multiPv": 1, "depth": depth}

    try:
        response = requests.get(LICHESS_API_URL, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        raise Exception(f"Lichess API request failed: {str(e)}")

    if "pvs" not in data or not data["pvs"]:
        raise Exception("No evaluation returned by Lichess API")

    best_moves_str = data["pvs"][0].get("moves", "")
    if not best_moves_str:
        raise Exception("No moves returned in best line")

    best_move_uci = best_moves_str.split(" ")[0]
    move = chess.Move.from_uci(best_move_uci)

    # Ensure move is legal for current board
    if move not in board.legal_moves:
        # fallback: pick first legal move
        print(f"Engine move {best_move_uci} illegal, picking fallback move")
        move = list(board.legal_moves)[0]

    print("Stockfish selected move:", move.uci())
    return move
