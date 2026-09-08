# Chess AI

Play chess in the browser against three engines. Next.js UI, FastAPI backend.

| Difficulty | Engine | Notes |
|---|---|---|
| Easy | CNN | Keras model, scores from-square and to-square, filtered to legal moves |
| Normal | Minimax | Depth 2, alpha-beta, material eval, mate-aware |
| Hard | Stockfish | Local binary → Lichess cloud eval → minimax depth 3 |

## Layout

```
backend/          FastAPI service
  main.py           POST /move, GET /health
  engines/          cnn_engine, minmax_engine, stockfish_engine
  test_engines.py   search correctness checks
  *.keras           CNN weights
frontend/         Next.js 14 app (the UI)
  app/page.tsx      game state, engine calls
  app/api/engine/   server-side proxy to the backend
  components/       board, move log, captured pieces, promotion dialog
model/            CNN training and evaluation scripts + dataset (Git LFS)
legacy/catmeme/   an earlier standalone UI, not wired to anything
```

## Setup

Backend:

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # source venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

UI at http://localhost:3000, API at http://localhost:8000.

`BACKEND_URL` overrides where the frontend proxies to (default `http://127.0.0.1:8000`).

## Hard mode

Lichess cloud eval is a *cache*, not an engine — it only answers for positions
someone already analysed, so it returns nothing for most positions past the
opening. For real Stockfish strength, install the binary and either put it on
`PATH` or set `STOCKFISH_PATH`:

```bash
export STOCKFISH_PATH=/usr/local/bin/stockfish
```

Without it, Hard falls back to minimax depth 3 rather than failing the request.

## API

```
POST /move
{ "fen": "<position>", "difficulty": "easy" | "normal" | "hard" }

200
{
  "move": "e2e4", "from": "e2", "to": "e4", "promotion": null,
  "san": "e4", "fen": "<position after>",
  "gameOver": false, "result": null
}
```

`400` invalid FEN, unknown difficulty, or a finished game. `502` engine failure.

## Tests

```bash
cd backend && python test_engines.py
```

Covers mate detection, mate avoidance, material capture, and terminal scoring.

## CNN model status

The shipped weights are **not trained to a useful standard**. From
`model/metrics.txt`: 5.6% complete-move accuracy, trained on 10,000 of the
8,155,187 available positions for 19 seconds, 88,704 parameters. Easy mode
produces legal moves because `cnn_engine` filters to legal moves, not because
the network is picking good ones. Retrain via `model/model_training.py` with a
larger sample before treating Easy as a real engine.

## License

MIT
