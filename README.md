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
  app/page.tsx      splash
  app/signin/       sign in
  app/register/     create account
  app/play/         the game: state, engine calls, history sync
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

The screens follow the design's own flow: `/` is the splash, which leads to
`/signin`, which leads to `/play` either by signing in or as a guest.
`/register` creates an account. To land straight on the board instead, point
`app/page.tsx` at the game rather than the splash.

`BACKEND_URL` overrides where the frontend proxies to (default `http://127.0.0.1:8000`).

`/play` is the chooser: the computer on one side, another person on the other.

**No database to hand?** `python dev_memory_db.py` runs the same API against an
in-memory Mongo, so accounts, history and chat work and disappear when the
process exits. `MESS_GRACE=3` shortens the disconnect grace period so a forfeit
can be watched without waiting a minute. Development only - `main.py` is what
runs for real.

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

Guests have no `users` row at all. Their identity is the signed id in their
cookie, and their games carry `guest_id` where an account's carry `user_id`;
every query scopes on whichever the caller presents.

`games`: `user_id`, `mode` (`engine` or `room`), `opponent` (an engine name or
a person's), `difficulty` (engine games only), `player_color`, `moves` (SAN), `fen`,
`status`, `outcome` (win/loss/draw, from the player's side), `result` (`1-0`),
`termination` (checkmate/stalemate/draw/resigned), and timestamps. Indexed on
`(user_id, started_at desc)`.

### Identity

Everyone who plays has one, so every game has an owner.

An **account** is a row in `users` and a session token. A **guest** is a signed
random id in a long-lived cookie and nothing else — no database row, so rooms
work even when Mongo is down. Both are the same kind of credential downstream:
one `Authorization: Bearer` header, one `current_identity` dependency, one
owner filter.

The two live in separate httpOnly cookies, `chess_token` and `chess_guest`, so
signing out clears the session and drops you back to the guest you already
were, with that history intact, rather than erasing you. A guest cookie lasts a
year. Neither is readable from page JavaScript.

Signing in is therefore not how you start being counted; it is how you carry
your games to another browser.

**Auth endpoints**

```
POST /auth/register  {username, password} -> {token, user}
POST /auth/login     {username, password} -> {token, user}
POST /auth/guest                          -> {token, user}  (no account needed)
GET  /auth/me        Bearer token         -> user or guest
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

`/play` asks what kind of game you want. Against the computer, no account is
needed. Against a person there are two ways in:

- **Invite someone.** Opens a room and gives you two links: one to play, one to
  watch. Unlimited watchers, one opponent.
- **Quick play.** Puts you in a queue and pairs you with whoever is waiting,
  colours drawn at random. The queue is polled, not socketed; sitting in one for
  a few seconds does not earn its own connection.

**Playing needs an account, watching does not.** A guest can open any link and
watch, but `POST /rooms` and taking a seat both refuse them, because a result
with nobody's name on it is not worth recording. Guests keep a signed identity
in a cookie regardless, so their engine games are still their own.

**A play link dies the moment both seats are full.** Whoever opens it then sees
"Both seats are taken" with a button to watch instead, and the person who sent
it is told over their own socket - the spec asked for both ends to know, and one
side learning while the other waits is the bug that hides behind that.

**The room belongs to the game, not to a player.** Whoever opened it may invite;
if they leave, the right passes to whoever is still seated, so a game never
strands its remaining player with no way to find an opponent.

**Leaving mid-game loses it, but not instantly.** A seat with a move behind it is
held for `GRACE_SECONDS` (60) while the board shows a countdown. Reconnecting -
a refresh included - drops you straight back into your own seat, because a seat
is matched by its owner's identity rather than by its connection. Let the clock
run out and the game is recorded as `abandoned` with the win to whoever stayed.
A seat abandoned *before* the first move is simply given back.

**Everyone in the room can talk.** Players and watchers share one chat. The last
50 messages ride along in every state snapshot so a late joiner sees the
conversation; the whole transcript goes to Mongo.

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
on restart, and an empty one is dropped after six hours. Room ids and invite
tokens are `secrets.token_urlsafe`, and an invite token is the only thing
protecting a room, so treat the link as the invitation it is.

### Who can actually reach the link

**As it stands, everyone has to be on the same network.** The link contains
your machine's address, so it works for you, for another browser on the same
machine, and for anyone on the same LAN or VPN. It does not work for someone
across the internet, because nothing here is publicly routable.

For a LAN, start the API on all interfaces and hand out your machine's address
rather than `localhost`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
npm run dev -- --hostname 0.0.0.0
```

Then share `http://<your-ip>:3000/room/<id>`. The page derives the WebSocket URL
from its own hostname, so the link works for whoever opens it.

### Going public with a tunnel

Two hostnames are needed, because the room's WebSocket talks to the API
directly and a Next route handler cannot proxy one. With cloudflared:

```bash
cloudflared tunnel --url http://localhost:3000   # the page
cloudflared tunnel --url http://localhost:8000   # the API
```

ngrok works the same way (`ngrok http 3000`, `ngrok http 8000`). Then wire the
two together — `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=https://<api-tunnel-host>
BACKEND_URL=https://<api-tunnel-host>
```

and `backend/.env`:

```
CORS_ORIGINS=https://<page-tunnel-host>
```

Restart the frontend afterwards: `NEXT_PUBLIC_*` is read at build time, not per
request. The page switches to `wss://` on its own when served over https, since
a plain `ws://` socket on an https page is blocked as mixed content.

Nothing about this is automatic yet. The tunnel hostnames change on every run
unless you have named tunnels, so this is a "when you want to demo it" path
rather than a deploy.

**WebSocket protocol.** Client sends `join` (`name`, `role`, optional
`ticket`), then `move` (`uci`), `sit`, `stand`, `engine`, `clearSeat`,
`resign` or `newGame`. The server replies with a full `state` snapshot to every
member after any change, or an `error` to the one client that asked for
something it could not have.

The `ticket` is a short-lived, WebSocket-only token from `POST /rooms/ticket`,
and it is required: a join without one is closed with code 4401. The browser
cannot read the httpOnly cookies, and the socket does not go through the Next
proxy, so the page trades one for the other rather than holding a long-lived
token in JavaScript. Tickets are issued for guests as well as accounts, which
is what lets an invite work for anyone while every seat still has an owner.

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

Rooms, invitations and the queue:

```
POST   /rooms                   open a room               (account only)
POST   /rooms/{id}/invites      { "kind": "play" | "watch" }  (host only)
GET    /invites/{token}         { "status": "ok" | "taken" | "gone", ... }
POST   /rooms/ticket            a short-lived ticket for the socket
POST   /matchmaking             join the queue            (account only)
GET    /matchmaking             waiting, or the room you were matched into
DELETE /matchmaking             leave the queue
WS     /rooms/{id}/ws           join, move, sit, stand, engine, resign,
                                newGame, chat
```

A `GET /invites/{token}` that comes back `taken` also pushes an
`inviteRejected` message to the host's socket, so neither end is left guessing.

## Tests

```bash
cd backend && python test_engines.py
cd backend && python test_rooms.py
cd frontend && node --experimental-strip-types lib/chess-ui.test.mts
```

The first covers mate detection, mate avoidance, material capture and terminal
scoring. `test_rooms.py` drives players and spectators through real
WebSockets. Refusals: moving out of turn, moving an opponent's pieces, a
spectator trying to move or resign, taking an occupied seat, moving after the
game has ended, a guest trying to open a room or sit down, and a non-host trying
to invite. Rules: a play invite dying when the seats fill (and the host being
told), a refresh keeping both the seat and the game, walking away losing it once
the grace period passes, the right to invite passing on when the host leaves,
chat reaching everyone and reaching Mongo, and quick play pairing two people. The third covers the plain-language move descriptions in the move
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
