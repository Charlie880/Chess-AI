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
  config.py         reads backend/.env
  db.py             MongoDB client + indexes
  auth.py           bcrypt hashing, JWT, current-user dependency
  routes_auth.py    /auth/register, /auth/login, /auth/me
  routes_games.py   /games CRUD + /games/stats
  engines/          cnn_engine, minmax_engine, stockfish_engine
  test_engines.py   search correctness checks
  *.keras           CNN weights
frontend/         Next.js 14 app (the UI)
  app/page.tsx      game state, engine calls, history sync
  app/api/          server-side proxies: engine, auth, games
  lib/server-api.ts backend calls + the httpOnly token cookie
  components/       board, move log, captured pieces, auth, history
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

## Accounts and game history

Copy `backend/.env.example` to `backend/.env` and fill in:

```
MONGO_URI=mongodb+srv://...
MONGO_DB=chess_ai
JWT_SECRET=<long random string>
```

Generate a secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

Without those two values the engine endpoints still work; `/auth` and `/games`
return 503 and the UI hides the history panel. `GET /health` reports which.

Signed in, every game is written to Mongo as one document that is replaced on
each move - a full-state PUT rather than an append, so a dropped or duplicated
request cannot corrupt the move list.

**Collections**

`users`: `username` (unique index), `password_hash` (bcrypt), `created_at`.

`games`: `user_id`, `difficulty`, `player_color`, `moves` (SAN), `fen`,
`status`, `outcome` (win/loss/draw, from the player's side), `result` (`1-0`),
`termination` (checkmate/stalemate/draw/resigned), and timestamps. Indexed on
`(user_id, started_at desc)`.

**Auth endpoints**

```
POST /auth/register  {username, password} -> {token, user}
POST /auth/login     {username, password} -> {token, user}
GET  /auth/me        Bearer token         -> user
POST /games          {difficulty, playerColor}
PUT  /games/{id}     {moves, fen, status, outcome, result, termination}
GET  /games          most recent first
GET  /games/stats    win/loss/draw counts
```

The JWT never reaches page JavaScript: the Next route handlers keep it in an
httpOnly, sameSite=lax cookie and attach it server-side, so an XSS on the page
cannot read it. Passwords are bcrypt-hashed, capped at bcrypt's 72-byte limit
rather than being silently truncated, and login returns one message whether or
not the account exists.

Not done: rate limiting on login, email/password reset, and refresh tokens.

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
