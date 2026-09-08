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
  rooms.py          shared rooms: the board, the seats, the rules
  routes_rooms.py   /rooms + the WebSocket channel
  test_rooms.py     room checks, mostly about what is refused
  engines/          cnn_engine, minmax_engine, stockfish_engine
  test_engines.py   search correctness checks
  *.keras           CNN weights
frontend/         Next.js 14 app (the UI)
  app/page.tsx      game state, engine calls, history sync
  app/api/          server-side proxies: engine, auth, games
  lib/server-api.ts backend calls + the httpOnly token cookie
  components/       board, move log, captured pieces, auth, history, rooms
  app/room/[id]/    the shared room page
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

`users`: `username` as typed, `username_lower` (unique index, so `Alice` and
`alice` are one account), `password_hash` (bcrypt), `created_at`.

`games`: `user_id`, `mode` (`engine` or `room`), `opponent` (an engine name or
a person's), `difficulty` (engine games only), `player_color`, `moves` (SAN), `fen`,
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

Hashing runs in a worker thread, since bcrypt deliberately costs 100-300ms and
would otherwise block every other request on the process. A login for an
unknown user is checked against a decoy hash so it takes the same time as a
real one and cannot be used to enumerate accounts.

Not done: rate limiting on login, email/password reset, and refresh tokens.

## Playing someone else

"Play someone else" opens a room and hands you a link. Whoever you send it to
picks a name and either takes the free seat or watches. No account is needed;
signing in only means the finished game lands in your history.

Either seat can also be filled by an engine, so a room works as a game between
two people, a game against a machine that others can watch, or two engines
playing each other.

**The server owns the board.** In single player the client could hold the
position, because the only person it could cheat was themselves. With two
people that stops being true, so a room validates every move in `rooms.py` and
broadcasts the position from there. Clients receive SAN and rebuild the
position locally, so there is one description of a game rather than two that
can drift apart.

Rooms live in server memory: they are conversations, not records. They vanish
on restart, and an empty one is dropped after six hours. The room id is a
`secrets.token_urlsafe(9)` and is the only thing protecting a room, so treat
the link as the invitation it is.

**Reaching it from another machine.** Start the API on all interfaces and point
the browser at your machine's address rather than `localhost`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The page derives the WebSocket URL from its own hostname and port 8000, so a
link that works for you works for anyone on the same network. If the API lives
somewhere else, set `NEXT_PUBLIC_API_URL` for the frontend. Reaching it over
the internet needs a tunnel or a deploy; nothing here assumes one.

**WebSocket protocol.** Client sends `join` (`name`, `role`, optional
`ticket`), then `move` (`uci`), `sit`, `stand`, `engine`, `clearSeat`,
`resign` or `newGame`. The server replies with a full `state` snapshot to every
member after any change, or an `error` to the one client that asked for
something it could not have.

The `ticket` is a short-lived, WebSocket-only token from `POST /rooms/ticket`.
The browser cannot read the httpOnly session cookie, and the socket does not go
through the Next proxy, so the page trades one for the other rather than
holding a session token in JavaScript.

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
  "engine": "normal",
  "gameOver": false, "result": null
}
```

`engine` names the engine that actually moved, which is not always the one
asked for: if the CNN has no weights, or a search returns nothing, the request
falls back to minimax rather than failing, and the UI says so instead of
claiming you are still playing a neural net.

`400` invalid FEN, unknown difficulty, or a finished game. `502` engine failure.

## Tests

```bash
cd backend && python test_engines.py
cd backend && python test_rooms.py
cd frontend && node --experimental-strip-types lib/chess-ui.test.mts
```

The first covers mate detection, mate avoidance, material capture and terminal
scoring. `test_rooms.py` drives two players and a spectator through real
WebSockets and is mostly about refusals: moving out of turn, moving an
opponent's pieces, a spectator trying to move or resign, taking an occupied
seat, and moving after the game has ended. The third covers the plain-language move descriptions in the move
list: quiet moves, captures, both castles, en passant, promotion, and the
check/checkmate distinction.

## CNN model status

The shipped weights are **not trained to a useful standard**. From
`model/metrics.txt`: 5.6% complete-move accuracy, trained on 10,000 of the
8,155,187 available positions for 19 seconds, 88,704 parameters. Easy mode
produces legal moves because `cnn_engine` filters to legal moves, not because
the network is picking good ones. Retrain via `model/model_training.py` with a
larger sample before treating Easy as a real engine.

## License

MIT
