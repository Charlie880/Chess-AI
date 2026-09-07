# ♟️ AI Chess Bot

A chess-playing web app with multiple difficulty levels, powered by:
- **Stockfish** (Hard mode)
- **Custom Minimax Engine** (Normal mode)
- **Lightweight CNN Model** (Easy mode)

Frontend built with **Next.js** + **React**.  
Backend powered by **FastAPI** with pluggable engines.

---

## 🚀 Features

- **Multiple difficulty levels**
  - Easy → CNN-based move prediction
  - Normal → Depth-limited Minimax search
  - Hard → Stockfish (via Lichess Cloud Evaluation or local binary)
- **Full chess rule enforcement** (legal move checking, checkmate/stalemate handling)
- **Live move logging** in the UI
- **Fast API responses** suitable for real-time play
- **Pluggable engine system** for easy swapping/adding AI backends

---

## 🏗 Architecture

frontend/ → Next.js app (chessboard UI, move logging, difficulty selector)
├─ app/page.tsx
├─ components/ChessBoard.tsx
├─ components/MoveLog.tsx
├─ components/ModeSelector.tsx
└─ lib/api.ts

backend/ → FastAPI app
├─ main.py → API routes
├─ engines/
│ ├─ stockfish_engine.py
│ ├─ minmax_engine.py
│ └─ cnn_engine.py
├─ models/ → ML models (e.g. novice_chess_model.keras)
└─ requirements.txt

yaml
Copy
Edit

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the repo
```bash
git clone https://github.com/your-username/chess-bot.git
cd chess-bot
2️⃣ Backend setup
bash
Copy
Edit
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

pip install -r requirements.txt
Make sure you have Python 3.9+ installed.

3️⃣ Frontend setup
bash
Copy
Edit
cd ../frontend
npm install
4️⃣ Model file
Place your trained CNN model file here:

bash
Copy
Edit
backend/models/novice_chess_model.keras
▶️ Running the App
Start backend
bash
Copy
Edit
cd backend
uvicorn main:app --reload --port 8000
Start frontend
bash
Copy
Edit
cd frontend
npm run dev
Frontend runs at http://localhost:3000
Backend API runs at http://localhost:8000

📡 API Documentation
POST /move
Request body:

json
Copy
Edit
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "difficulty": "easy"
}
Difficulty options:

"easy" → CNN engine

"normal" → Minimax engine

"hard" → Stockfish engine

Response:

json
Copy
Edit
{
  "move": "e2e4",
  "from": "e2",
  "to": "e4",
  "san": "e4",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
}
🧠 Engine Details
Easy Mode (CNN Engine)
Model input: 8×8×13 tensor

Channels: 12 piece types + 1 turn indicator

Output: Two probability distributions (from_square, to_square)

Picks highest scoring legal move

Normal Mode (Minimax Engine)
Standard minimax search with evaluation function

Adjustable depth (default: 2)

Hard Mode (Stockfish Engine)
Integrates Stockfish via Python chess library

Supports depth tuning or skill level settings

📊 Model Training (CNN)
If you want to retrain the CNN:

Prepare PGN/FEN dataset

Convert games to (board_tensor, move) pairs

Train with Keras:

python
Copy
Edit
model.fit(train_ds, epochs=30, validation_data=val_ds)
Save:

python
Copy
Edit
model.save("models/novice_chess_model.keras")
🛠 Development Tips
Keep the model lightweight for faster inference in Easy mode

CNN predictions are filtered through legal move checking, so even bad models won’t break the game

You can hot-swap engines by editing engines/ and not touching main.py

If running on limited hardware, disable Stockfish and use Minimax only

📜 License
MIT License — free to use and modify.

🙌 Credits
python-chess for move generation and rules

Stockfish for strong chess AI

TensorFlow/Keras for CNN training

Next.js + React for the frontend