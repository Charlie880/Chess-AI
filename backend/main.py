from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import chess
from engines import stockfish_engine, cnn_engine, minmax_engine

app = FastAPI()


class MoveRequest(BaseModel):
    fen: str
    difficulty: str  # "easy", "normal", "hard"


@app.post("/move")
def make_move(request: MoveRequest):
    try:
        board = chess.Board(request.fen)
        print("Incoming FEN:", request.fen)
        print("Difficulty:", request.difficulty)

        # --- Choose engine ---
        if request.difficulty == "easy":
            move = cnn_engine.get_move(board)
        elif request.difficulty == "normal":
            move = minmax_engine.get_move(board, depth=2)
        elif request.difficulty == "hard":
            move = stockfish_engine.get_move(board)
        else:
            raise HTTPException(status_code=400, detail="Invalid difficulty")

        # --- Validate legality ---
        if move not in board.legal_moves:
            # fallback to first legal move to avoid 500
            print(f"Engine returned illegal move {move.uci()}, using first legal move instead")
            move = list(board.legal_moves)[0]

        # --- Generate SAN BEFORE pushing ---
        san_move = board.san(move)
        board.push(move)

        # --- Prepare response for UI ---
        response = {
            "move": move.uci(),
            "from": move.uci()[:2],
            "to": move.uci()[2:],
            "san": san_move,
            "fen": board.fen()
        }

        print("Move response:", response)
        return response

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN provided")
    except Exception as e:
        print("Unexpected error:", e)
        raise HTTPException(status_code=500, detail=str(e))
