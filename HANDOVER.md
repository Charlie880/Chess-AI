# Mess — Handover and Report Source

Everything needed to pick this project up, run it, extend it, or write a report
about it. Written against commit `7510422` (2026-09-24).

Companion documents: `README.md` (how to run and operate it) and `design/README.md`
(the visual design source). This file is the one that explains *why* the system is
shaped the way it is, which is what a report needs and what a README deliberately
leaves out.

---

## 1. What the system is

**Mess** is a chess application with two halves that were built for different
reasons and now share one interface:

1. **A chess engine service.** Three different opponents behind one HTTP
   endpoint — a convolutional neural network, a classical minimax search, and
   Stockfish. The point of the project is that these are genuinely different
   machines with different failure modes, and the interface says which one you
   are playing rather than hiding them behind Easy/Normal/Hard.
2. **A multiplayer room service.** Server-authoritative chess between two signed-in
   people, with unlimited spectators, link invitations, a shared chat, and rules
   for what happens when somebody walks away mid-game.

Around both sits identity (accounts and guests), and game history in MongoDB.

**Status: feature-complete and verified locally.** The single unresolved
dependency is a live MongoDB cluster — the Atlas cluster in `backend/.env` was
deleted and its hostname no longer resolves, so accounts, history and stored
chat need a new `MONGO_URI` before a real deployment. Everything was verified
against an in-memory MongoDB substitute (`backend/dev_memory_db.py`), which is
why the test evidence in §11 exists at all.

### Technology

| Layer | Choice | Version | Why |
|---|---|---|---|
| UI | Next.js App Router, React | 14.2, 18 | Server-side route handlers let the browser never hold an API token |
| Styling | Tailwind CSS | 3.4 | The design is a token system; Tailwind is a token system |
| Client chess rules | chess.js | latest | Legality and SAN in the browser for instant feedback |
| API | FastAPI + Uvicorn | ≥0.110 | Async, typed request bodies, first-class WebSockets |
| Server chess rules | python-chess | ≥1.10 | The authoritative board lives here |
| Database | MongoDB via `pymongo.AsyncMongoClient` | ≥4.9 | Documents suit "one game, one record, updated in place" |
| Identity | PyJWT + bcrypt | ≥2.8, ≥4.1 | Stateless tokens; bcrypt for stored secrets |
| Easy engine | TensorFlow / Keras | ≥2.16 | Optional — the API runs without it |
| Hard engine | Stockfish binary, else Lichess cloud eval, else minimax | — | Optional — degrades instead of failing |

---

## 2. Architecture

### 2.1 The whole picture

```
                        BROWSER
   ┌──────────────────────────────────────────────────────────┐
   │  Next.js pages (React, client components)                │
   │    /                splash                               │
   │    /signin /register                                     │
   │    /play            chooser: computer / person           │
   │    /play/computer   engine game                          │
   │    /room/[id]       multiplayer room                     │
   │    /join/[token]    invitation landing                   │
   └───────┬───────────────────────────────────┬──────────────┘
           │ fetch (same origin, cookies)      │ WebSocket (direct)
           ▼                                   │
   ┌────────────────────────────────┐          │
   │  Next.js route handlers        │          │
   │  /api/*  — server-side proxy   │          │
   │  reads httpOnly cookies,       │          │
   │  attaches Bearer token         │          │
   └───────┬────────────────────────┘          │
           │ HTTP + Bearer                     │
           ▼                                   ▼
   ┌──────────────────────────────────────────────────────────┐
   │  FastAPI  (port 8000)                                    │
   │  ┌────────────┬───────────────┬──────────────────────┐    │
   │  │ /move      │ /auth /games  │ /rooms /invites      │    │
   │  │ engines    │ identity +    │ /matchmaking + WS    │    │
   │  │            │ history       │ (rooms.py in memory) │    │
   │  └─────┬──────┴───────┬───────┴──────────┬───────────┘    │
   └────────┼──────────────┼──────────────────┼────────────────┘
            ▼              ▼                  ▼
     CNN / minimax /   MongoDB          in-process room
     Stockfish         users, games,    registry + asyncio
     (+ Lichess)       messages         locks per room
```

### 2.2 Three request paths, and why they differ

**Path A — an engine game (`/play/computer`).** The *client* owns the board.
chess.js validates the move locally, the UI updates immediately, then
`POST /api/engine` → `POST /move` asks for a reply with the FEN in the body. The
API is stateless here: it holds no game. This is correct because the only person
a cheating client could cheat is themselves.

**Path B — history (`/api/games/*` → `/games/*`).** One document per game,
created lazily on the first move and replaced whole on each update. Replacing
rather than appending means a dropped or duplicated request cannot corrupt a
move list.

**Path C — a room (`/room/[id]`).** The *server* owns the board. With two people,
"the client owns the position" stops being safe, so every move is validated in
`rooms.py` and the resulting position is broadcast from there. Clients receive
SAN and replay it locally, so there is exactly one description of a position
rather than two that can drift apart.

The WebSocket connects **directly** to the API, not through Next.js, because a
Next route handler cannot proxy a WebSocket. This is the one place where the
browser needs to know the API's address (`NEXT_PUBLIC_API_URL`), and the reason
a tunnelled deployment needs two hostnames.

### 2.3 Why a server-side proxy at all

Every `/api/*` route in the frontend is a server-side handler that reads an
`httpOnly` cookie and re-issues the call to FastAPI with an `Authorization:
Bearer` header. Consequences worth stating in a report:

- Page JavaScript never holds a session token, so an XSS cannot read one.
- The API accepts no ambient cookie authentication at all, which is why
  permissive CORS is defensible: every call must present a bearer token.
- The browser talks to one origin, so there is no CORS preflight in the normal path.

### 2.4 Rooms are memory, not records

A room is a conversation, not a record. `rooms.ROOMS` is a process-local dict;
rooms vanish on restart and an idle one is pruned after six hours (lazily, on the
next create, so there is no background task to supervise). What *is* durable: the
finished game (written once per seated player) and the chat transcript.

Each room carries its own `asyncio.Lock`. Every mutation — a move, a seat change,
a forfeit — happens under it, so two sockets cannot interleave a move and a
disconnect. **Ceiling:** single-process only. Two Uvicorn workers would not share
the registry; that is the upgrade point if this ever needs to scale horizontally
(Redis pub/sub, or sticky routing by room id).

---

## 3. Repository map

```
Mess/
├── backend/                     FastAPI service
│   ├── main.py                  app, lifespan, CORS, /health, POST /move
│   ├── config.py                .env reader (no dependency), all env config
│   ├── db.py                    Mongo connection + indexes; never raises
│   ├── auth.py                  JWT, guests, bcrypt, WS tickets, dependencies
│   ├── routes_auth.py           /auth/register /login /guest /me
│   ├── routes_games.py          /games CRUD + /games/stats
│   ├── routes_rooms.py          /rooms, /invites, /matchmaking, the WebSocket
│   ├── rooms.py                 the room model and every multiplayer rule
│   ├── matchmaking.py           quick-play queue
│   ├── dev_memory_db.py         run everything against an in-memory Mongo
│   ├── engines/
│   │   ├── cnn_engine.py        Easy — Keras model, lazily loaded
│   │   ├── minmax_engine.py     Normal — depth-2 alpha-beta, and the fallback
│   │   └── stockfish_engine.py  Hard — binary → Lichess cloud eval → minimax
│   ├── test_engines.py          4 engine tests
│   ├── test_rooms.py            11 room tests over real WebSockets
│   └── .env.example             every variable, documented
├── frontend/                    Next.js 14 App Router
│   ├── app/
│   │   ├── page.tsx             splash
│   │   ├── signin/ register/    auth screens
│   │   ├── play/page.tsx        chooser: computer, invite, or quick play
│   │   ├── play/computer/       the engine game (board, history, scoresheet)
│   │   ├── room/[id]/           the multiplayer room
│   │   ├── join/[token]/        invitation landing: ok / taken / gone
│   │   └── api/                 server-side proxies (see §5.6)
│   ├── components/
│   │   ├── ChessBoard.tsx       the board; container-query glyph sizing
│   │   ├── RoomBoard.tsx        the room: seats, away banner, chat, invites
│   │   ├── RoomSeats.tsx        sit / stand / add an engine / clear a seat
│   │   ├── RoomChat.tsx         one chat for players and watchers
│   │   ├── RoomInvites.tsx      the two links, and when a play link is useless
│   │   ├── Scoresheet.tsx       the move list in words ("Knight to e4")
│   │   ├── PlayerRail.tsx       who is playing, whose turn, material
│   │   ├── EngineSelector.tsx   which machine you are playing
│   │   ├── GameHistory.tsx      past games from /games
│   │   ├── PromotionDialog.tsx  queen/rook/bishop/knight
│   │   ├── AuthPanel.tsx AuthShell.tsx SiteMark.tsx
│   ├── lib/
│   │   ├── room.ts              useRoom(): ticket, socket, state, chat, notices
│   │   ├── server-api.ts        cookies, callBackend, ensureIdentity
│   │   ├── chess-ui.ts          piece glyphs, material, move descriptions
│   │   ├── chess-ui.test.mts    4 checks on the move descriptions
│   │   └── engines.ts           what each engine actually is
│   └── tailwind.config.js       the design tokens (§9)
├── model/                       training and evaluation for the Easy engine
│   ├── model_training.py  model_testing.py  metrics.txt  chess_data.zip
├── design/                      imported Claude Design source
├── README.md                    setup and operation
└── HANDOVER.md                  this file
```

---

## 4. Features

### 4.1 Feature list

| Area | Feature | Notes |
|---|---|---|
| Engines | Three opponents behind one endpoint | Easy CNN, Normal minimax depth 2, Hard Stockfish |
| Engines | Graceful degradation | Engine declines or returns an illegal move → minimax answers, response names the engine that actually moved |
| Play | Full legal chess | castling, en passant, promotion dialog, check/mate/stalemate |
| Play | Readable move list | "Knight to e4", "Pawn takes pawn on d5", both castles, promotion, check/mate |
| Play | Material count and turn indicator | |
| Identity | Accounts | username 3–24 chars, optional email, case-insensitive, bcrypt |
| Identity | Guests | signed random id in a year-long cookie; their games are still theirs |
| History | One record per game | created lazily on first move, replaced whole, scoped by owner |
| History | Win/loss/draw statistics | `/games/stats`, aggregation pipeline |
| Multiplayer | Rooms with two seats and unlimited watchers | server-authoritative board |
| Multiplayer | Invitations | one link to play, one to watch |
| Multiplayer | Play link expires on a full room | both the invitee and the host are told |
| Multiplayer | Host inheritance | the right to invite passes to whoever is still seated |
| Multiplayer | Reconnection | a refresh returns you to your own seat and game |
| Multiplayer | Grace period then forfeit | 60 s with a visible countdown, then the game is `abandoned` |
| Multiplayer | Room chat | players and watchers; 50-message tail in every snapshot; transcript in Mongo |
| Multiplayer | Quick play | a polled queue, random colours |
| Multiplayer | Engines in a room | either seat can be a machine, so two engines can play while people watch |
| Operations | Runs without a database | engines and rooms work; `/auth` and `/games` answer 503 with the reason |
| Operations | Runs without TensorFlow or Stockfish | Easy and Hard fall back |
| Operations | In-memory database runner | `dev_memory_db.py` for development and testing |

### 4.2 Use cases

**UC-1 — Play the computer, no account.** `/play` → "Play the computer" → pick an
engine → play. A guest identity is minted on first visit, so the game still lands
in history and is still theirs on the next visit.

**UC-2 — Register and review your record.** `/register` → play → `/play/computer`
shows past games and a win/loss/draw split, scoped to that account. A second
account sees nothing of the first, and a direct game id from another account is a
404, not a 403 — the ownership filter is part of the query.

**UC-3 — Invite a friend to play.** Sign in → `/play` → "Invite someone" → a room
opens and you are seated → generate a play link → they open it, land in the room
seated opposite you, and the game starts. Moves, chat and clocks flow over one
socket each.

**UC-4 — Invite an audience.** From the same room, generate a watch link. Anybody
can open it, account or not, and watch the board update move by move. Watchers
can chat; they cannot move, resign or start a new game.

**UC-5 — A play link that arrived too late.** Both seats are full when the third
person opens the play link. They see "Both seats are taken" with a button to watch
instead; the host receives `inviteRejected` on their socket and a dismissible
notice on screen. Neither end is left guessing — that symmetry was an explicit
requirement.

**UC-6 — Somebody drops mid-game.** The seat is held, the board shows an away
banner counting down from 60 s. Reconnecting — including a plain refresh — returns
them to their own seat with the game intact, because a seat is matched by its
owner's identity, not by its connection. If the clock runs out, the remaining
player wins and the game is recorded with `termination: "abandoned"`. A seat
abandoned *before* the first move is simply given back, so an accidental visit
does not become a loss.

**UC-7 — The host leaves.** The right to invite passes to whoever is still seated,
so the remaining player can find a new opponent. The room belongs to the game, not
to the person who opened it.

**UC-8 — Quick play.** Sign in → `/play` → "Quick play". You sit in a queue
(polled every 2 s, cancellable, released if you navigate away) until somebody else
asks, then both of you are dropped into a room with seats already reserved and
colours drawn at random.

**UC-9 — Watch two machines.** Put an engine in each seat of a room and hand out
watch links.

---

## 5. API reference

Base URL `http://127.0.0.1:8000`. Every route except `/health`, `/move` and
`/auth/*` requires `Authorization: Bearer <token>`.

### 5.1 Service

```
GET /health
→ { "status": "ok", "engines": ["easy","hard","normal"], "persistence": false }
```
`persistence` is the honest answer to "is a database attached", which is why it is
the first thing to check when `/auth` returns 503.

### 5.2 Engines

```
POST /move
{ "fen": "<position>", "difficulty": "easy" | "normal" | "hard" }

200 { "move": "e2e4", "from": "e2", "to": "e4", "promotion": null,
      "san": "e4", "fen": "<position after>", "engine": "normal",
      "gameOver": false, "result": null }

400  invalid FEN, unknown difficulty, or a game that is already over
502  the engine raised
500  no legal move could be produced
```
`engine` names the engine that actually moved, which is not always the one asked
for. Error text is a fixed string, because engine exceptions can carry filesystem
paths.

### 5.3 Identity

```
POST /auth/register  { username, password, email? }
  201/200 → { token, user: { kind: "user", id, username, ... } }
  400 bad username or password   409 username taken   503 no database

POST /auth/login     { username, password }
  → { token, user }        401 "Incorrect username or password"

POST /auth/guest     (no body)
  → { token, user: { kind: "guest", id, username: "Guest ab12" } }

GET  /auth/me        → the caller's identity
```
Username: 3–24 characters, letters/digits/`_`/`-`, matched case-insensitively.
Password: at least 8 characters, at most 72 bytes (bcrypt's own limit).

### 5.4 Game history

```
POST   /games            { difficulty, playerColor }         → 201 { id, ... }
PUT    /games/{id}       { moves[], fen, status, outcome, result, termination }
GET    /games?limit=25&skip=0                                → [ game, ... ]
GET    /games/stats      → { win, loss, draw, finished, total }
GET    /games/{id}       → game       (another owner's id is a 404)
```
All of `/games` requires persistence; without it the whole router answers 503.
Caps: 800 moves per game, 12 characters per move entry.

### 5.5 Rooms, invitations and quick play

```
POST   /rooms                      → 201 { id }           403 for a guest
GET    /rooms/{id}                 → { id, status, seats }  404 if gone
POST   /rooms/ticket               → { ticket, name, kind }  (5-minute, ws-scoped)

POST   /rooms/{id}/invites  { kind: "play" | "watch" }
                                   → 201 { token, kind, roomId }   403 non-host
GET    /invites/{token}            → { status: "ok"|"taken"|"gone",
                                       kind, roomId, canWatch }

POST   /matchmaking                → { status: "waiting", waiting: n }
                                     or { status: "matched", roomId }
GET    /matchmaking                → the same shape, for polling
DELETE /matchmaking                → leave the queue
```
`GET /invites/{token}` has a side effect that matters: a `taken` result also
pushes `inviteRejected` to the host's socket. Resolving an invitation over HTTP
before any socket opens is what lets the page say "no longer valid" without
joining first.

### 5.6 WebSocket protocol

```
WS /rooms/{id}/ws
```

First frame must be a join, carrying a ticket from `POST /rooms/ticket`:

```json
{ "type": "join", "name": "Ada", "role": "play" | "watch", "ticket": "<jwt>" }
```

Client → server afterwards:

| Message | Effect |
|---|---|
| `{ "type": "move", "uci": "e2e4" }` | validated against the server's board |
| `{ "type": "sit", "color": "w"\|"b" }` | accounts only |
| `{ "type": "stand" }` | give the seat back |
| `{ "type": "engine", "color", "difficulty" }` | put a machine in a seat |
| `{ "type": "clearSeat", "color" }` | empty a seat |
| `{ "type": "resign" }` | seated players only |
| `{ "type": "newGame" }` | seated players only |
| `{ "type": "chat", "text": "…" }` | ≤500 characters |

Server → client:

| Message | Meaning |
|---|---|
| `state` | the full snapshot: `fen`, `moves` (SAN), `turn`, `status`, `result`, `termination`, `seats` (with `away` and `secondsLeft`), `watchers`, `chat` tail, and `you` (`id`, `color`, `canInvite`, `canPlay`) |
| `chat` | one message; chat does not need a board broadcast |
| `inviteRejected` | your invitation arrived too late |
| `error` | a refusal, e.g. `"Sign in to take a seat"`, `"You are watching this game"` |

Close codes: `4404` no such room, `4401` no valid ticket, `4400` first frame was
not a join.

### 5.7 Frontend proxies

Each exists only to attach the caller's identity server-side:

```
/api/engine                    → POST /move
/api/auth/{register,login,logout,me}
/api/games  /api/games/[id]  /api/games/stats
/api/rooms  /api/rooms/ticket  /api/rooms/[id]/invites
/api/invites/[token]  /api/matchmaking
```

---

## 6. Data model

### 6.1 MongoDB (`chess_ai`)

**`users`** — `{ username, username_lower, email, password_hash, created_at }`.
Unique index on `username_lower`: uniqueness lives in the index rather than an
application check, because check-then-insert races two concurrent registrations.

**`games`** — one document per game per player.

```
{ user_id | guest_id, mode: "engine" | "room", room_id?,
  difficulty, opponent, player_color, moves[], fen,
  status: "in_progress" | "finished",
  outcome: "win" | "loss" | "draw",
  result: "1-0" | "0-1" | "1/2-1/2",
  termination: "checkmate" | "stalemate" | "draw" | "resigned" | "abandoned",
  started_at, updated_at, finished_at }
```
Indexed `(user_id, started_at desc)` and `(guest_id, started_at desc)`. A room
game writes one document per seated player, so both sides own their copy.

**`messages`** — `{ room_id, owner_id, name, text, at }`, indexed
`(room_id, at asc)`. Chat is broadcast first and stored afterwards: delivery never
waits on the database.

### 6.2 In memory (`rooms.py`)

```
Room   id, host_id, board (python-chess), moves[SAN], seats{w,b}, members{},
       chat[], status, result, termination, saved, created_at, touched_at, lock
Seat   kind ("human"|"engine"), name, member_id, owner_kind, owner_id,
       difficulty, away_since
Member id, name, owner_kind, owner_id, socket
Invite token, room_id, kind, created_by, created_at
```

`Seat.owner_id` versus `Seat.member_id` is the single most important distinction
in the codebase: the owner is the identity that holds the seat, the member is the
socket currently sitting in it. Separating them is what makes a refresh survive,
and what makes a 60-second absence a decision rather than an accident.

### 6.3 Limits and timings

| Constant | Value | Where |
|---|---|---|
| Grace period before forfeit | 60 s | `rooms.GRACE_SECONDS` |
| Idle room lifetime | 6 h | `rooms.IDLE_ROOM_TTL` |
| Rooms per process | 500 | `rooms.MAX_ROOMS` |
| Invites per room | 50 | `rooms.MAX_INVITES_PER_ROOM` |
| Chat tail in a snapshot | 50 messages | `rooms.MAX_CHAT_KEPT` |
| Chat message length | 500 chars | `rooms.MAX_CHAT_LENGTH` |
| Display name length | 24 chars | `rooms.MAX_NAME_LENGTH` |
| Moves per stored game | 800 | `routes_games.MAX_MOVES` |
| WebSocket ticket | 5 min | `auth.WS_TICKET_MINUTES` |
| Session token | 7 days | `JWT_EXPIRE_MINUTES=10080` |
| Guest identity | 365 days | `auth.GUEST_EXPIRE_DAYS` |
| Queue entry staleness | 20 s | `matchmaking.STALE_AFTER` |

---

## 7. Identity and security

**Two credentials, both `httpOnly`.** `chess_token` is an account; `chess_guest`
is the identity everyone else gets, minted on first contact and kept for a year.
Signing out clears only the session, dropping you back to the guest you were, so
a guest's history is not destroyed by someone else signing out on that browser.

**Tokens are JWTs with a `kind`.** `user` tokens carry a Mongo ObjectId; `guest`
tokens carry a random id. Nothing downstream has to guess which it is holding.

**WebSocket tickets.** The page never holds a session token, so it cannot put one
in a WebSocket URL. `POST /rooms/ticket` exchanges the session for a 5-minute,
`scope: "ws"` token, which is the only credential the socket accepts. A ticket
leaked in a log is worth five minutes of joining rooms and nothing else.

**Password storage and timing.** bcrypt, run in a worker thread
(`anyio.to_thread.run_sync`) so a ~200 ms hash does not block the event loop. A
login for a username that does not exist still verifies the password against a
decoy hash, so response time does not reveal which accounts exist — the naive
`user is None or not verify(...)` short-circuit was a ~1 ms versus ~200 ms oracle
and was fixed deliberately.

**Ownership is enforced in the query.** `/games/{id}` looks up
`{_id, user_id|guest_id}` together, so another owner's id is a 404 rather than a
document that code then has to remember to reject.

**Authorisation rules in rooms.** Opening a room, taking a seat, inviting and
joining the queue all require an account. Watching requires only an identity.
Invite creation requires being the host. Moving, resigning and starting a new
game require holding a seat. Each refusal has its own message, and each is
covered by a test.

**Input caps everywhere.** Move lists, move strings, chat length, names, invites
per room, rooms per process. The point is that no client can push an unbounded
array or string into memory or into a document.

**CORS.** Permissive by configuration is safe here *because* the API has no
ambient cookie auth: every request must present a bearer token. `CORS_ORIGINS`
still exists so a tunnelled deployment can be pinned to its own hostname.

---

## 8. The engines

### 8.1 Easy — convolutional neural network

Keras model, loaded lazily so the API still starts on a machine without
TensorFlow or without the weights. It scores from-square and to-square
independently and the result is filtered to legal moves.

**Measured quality (`model/metrics.txt`):**

| Metric | Value |
|---|---|
| Complete-move accuracy | 5.6% |
| From-square top-1 / top-3 / top-5 | 13.4% / 28.0% / 37.2% |
| To-square top-1 / top-3 / top-5 | 11.2% / 23.0% / 29.2% |
| Parameters | 88,704 |
| Training positions used | 10,000 of 8,155,187 available |
| Training time | 19.4 s, early stop at epoch 16, weights from epoch 11 |

State this plainly in any report: **Easy produces legal moves because of the
legality filter, not because the network plays chess.** Retraining on a real
fraction of the 8.1M positions via `model/model_training.py` is the single
highest-value improvement available to this project.

### 8.2 Normal — minimax

Depth-2 alpha-beta with material evaluation in centipawns
(P 100, N 320, B 330, R 500, Q 900) and separate mate scoring. It is also the
fallback for every other engine, which is why it must never fail.

### 8.3 Hard — Stockfish, with two fallbacks

1. A local Stockfish binary (`STOCKFISH_PATH` or on `PATH`), depth 15. Spawned
   once behind a lock, because `/move` is a sync handler that FastAPI runs in a
   threadpool and two concurrent first requests would otherwise orphan a process.
2. Lichess cloud eval — a *cache*, not an engine. It only knows positions someone
   already analysed, so it 404s on most positions past the opening.
3. Minimax at depth 3, so Hard degrades instead of 500-ing mid-game.

---

## 9. Interface and design

Imported from a Claude Design project ("Mess Game") and implemented as Tailwind
tokens in `frontend/tailwind.config.js`.

**Palette.** One accent (gold `#b8963e`) over paper `#f6f6f4`, cards `#ffffff`,
hairlines `#e6e6e1`, ink `#1a1a1a`, secondary text `#55554f`, metadata `#8b8b86`.
Board light `#f4f1ea`, dark `#cfc6b3`, selection `#e6cf8e`. Alarm `#9a3a2e`.

**Type.** Three faces, one job each: Cinzel for the wordmark, Playfair Display
for the single display line per screen, Manrope for everything else, all through
`next/font/google`.

**Contrast was computed, not eyeballed.** 4.5:1 for text, 3:1 for non-text. Two
findings worth reporting: board coordinates first came out at 1.5:1 and were
replaced with a single dark tone (`coord #4a453b`) that clears both square
colours — a *light* coordinate cannot work on `#cfc6b3`, where white tops out at
1.7:1 — and move indicator dots at 1.5:1 became `ink/55`.

**A platform bug worth documenting.** Unicode chess glyphs rendered as fixed
purple emoji on Windows, because Segoe UI Emoji claims those codepoints and
ignores `color`. Both sides are drawn from the *solid* block (U+265A–F) and
coloured, each glyph suffixed with U+FE0E, the text-presentation selector. The
outline block (U+2654–9) renders as hollow line art that disappears on light
squares.

**Layout.** Full-page, three zones, no fixed sidebar. Board glyphs size from
container queries (`78cqh`) rather than viewport units, so the board scales with
its own column.

---

## 10. Running it

```bash
# API
cd backend
python -m venv venv && venv\Scripts\activate      # source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# UI, second terminal
cd frontend
npm install
npm run dev
```

UI on `http://localhost:3000`, API on `http://localhost:8000`.

**Without a database** (the current situation): `python dev_memory_db.py` runs the
same app against an in-memory MongoDB (`mongomock`), so accounts, history and
chat all work and disappear with the process. `MESS_GRACE=3` shortens the
disconnect grace period so a forfeit can be watched without waiting a minute.
Development only — `main.py` is what runs for real.

**Environment.** Backend: `JWT_SECRET` (required for identity), `MONGO_URI`,
`MONGO_DB`, `JWT_EXPIRE_MINUTES`, `CORS_ORIGINS`, `STOCKFISH_PATH`. Frontend:
`BACKEND_URL` (server-side proxy target), `NEXT_PUBLIC_API_URL` (where the
browser's WebSocket should go — read at build time, so restart after changing).
Both have a documented `.env.example`.

**Over a LAN:** `uvicorn main:app --host 0.0.0.0` and
`npm run dev -- --hostname 0.0.0.0`, then share your machine's address rather
than `localhost`. **Over the internet:** two tunnels, one for the page and one
for the API, because the room socket bypasses Next.js; point
`NEXT_PUBLIC_API_URL` at the API tunnel and `CORS_ORIGINS` at the page tunnel.

---

## 11. Testing and evidence

```bash
cd backend  && python test_engines.py
cd backend  && python test_rooms.py
cd frontend && node --experimental-strip-types lib/chess-ui.test.mts
cd frontend && npx tsc --noEmit && npm run build
```

- **`test_engines.py` (4 tests)** — mate detection, mate avoidance, material
  capture, terminal scoring.
- **`test_rooms.py` (11 tests)** — real WebSockets against `mongomock`. Refusals:
  moving out of turn, moving an opponent's piece, a spectator moving or resigning,
  an occupied seat, a move after the game ended, a guest opening a room or sitting
  down, a non-host inviting. Rules: a play invite dying when the seats fill and
  the host being told, a refresh keeping seat and game, walking away losing the
  game with both history rows written, the right to invite passing on, chat
  reaching everyone and reaching the database, quick play pairing two people.
- **`chess-ui.test.mts` (4 checks)** — the plain-language move descriptions:
  quiet moves, captures, both castles, en passant, promotion, check versus mate.

**Live end-to-end verification (2026-09-24).** A driver script exercised the
running API over real HTTP and WebSockets — 21 assertions, all passing: the
account gate (403 for a guest on `POST /rooms`, "Sign in to take a seat" on
`sit`), host-only invites, a play link going `taken` with the host notified,
watch links surviving, watcher chat reaching both players, the chat row reaching
the database, a mid-game disconnect showing a countdown then resolving to
`finished / abandoned / 1-0` with both history rows written, host inheritance, and
quick play pairing. The browser was then driven through the same flow: the chooser
disabling both human options for a guest, "Invite someone" seating the host and
producing both links, a second player joining over the link with their name and
chat appearing live, a third client seeing "Both seats are taken … Whoever invited
you has been told", and "WATCH INSTEAD" landing in the room as a spectator with no
invite panel.

Two defects were found *by* that run and fixed: `/api/rooms` was not forwarding
identity at all (so "Invite someone" could never have worked from the browser),
and the chooser pushed `/room/{id}` without `?as=play`, so a host was asked
whether to play or watch in their own room.

---

## 12. Known limitations and next steps

**Blocking.**
1. **No database.** `cluster0.9k0cb.mongodb.net` returns NXDOMAIN for SRV, TXT and
   A records from the system resolver, 8.8.8.8 and 1.1.1.1 alike — a paused
   cluster still resolves, so this one is deleted. Accounts, history and stored
   chat need a new `MONGO_URI`. `JWT_SECRET` in `backend/.env` is valid.

**Known ceilings, by design.**
2. **Single process.** Rooms and the queue live in process memory. Two workers
   would not share them. Upgrade path: Redis for the registry and a pub/sub
   broadcast, or sticky routing by room id.
3. **No clocks.** There is no per-move time control, only the 60-second
   disconnect grace period.
4. **The Easy engine is not trained.** See §8.1.
5. **No rating or preference in quick play.** The next arrival takes whoever is
   waiting.
6. **Invitation tokens do not expire on their own.** A watch link is good for the
   life of the room; a play link is good while a seat is open. The token is the
   only thing protecting a room, so the link is the invitation.
7. **Chat is not moderated** and is capped only by length.

**Cosmetic.**
8. `frontend/public/mess-mark.png` is still missing; `SiteMark` paints it as a CSS
   background so the absence renders as nothing rather than a broken image. Drop
   the real file in and it appears everywhere.
9. In development, React's double-invoked effects make the host receive the
   `inviteRejected` notice twice. A production build fires it once.

**Sensible next features**, in the order they would pay off: retrain the CNN;
add time controls; move rooms behind Redis so the service can scale; then a
rematch button and a spectator count.

---

## 13. Using this document to build a report

Direct mapping from sections here to the chapters a project report usually wants:

| Report chapter | Source | What to lift |
|---|---|---|
| Abstract / Introduction | §1 | The two halves, and the stack table |
| Literature / background | §8 | Neural versus classical search versus a real engine; three approaches, measured |
| Requirements | §4.2 | Nine use cases, already written as scenarios |
| System architecture | §2 | The diagram, the three request paths, why the server owns the board in one case and not the other |
| Module design | §3, §6.2 | The file map; `Seat.owner_id` versus `member_id` is the best single design example |
| Database design | §6.1 | Three collections, their indexes, and why uniqueness sits in the index |
| API design | §5 | Full endpoint and WebSocket protocol tables |
| Security | §7 | Cookie split, WS tickets, bcrypt off the event loop, the timing oracle and its fix, ownership in the query |
| UI design | §9 | Palette, type, the computed-contrast findings, the emoji-glyph bug |
| Implementation notes | §2.4, §8.3 | Per-room locks; the three-tier Hard engine |
| Testing | §11 | Test counts, what each covers, the 21-assertion live run, and the two defects it caught |
| Results | §8.1 | The model metrics table |
| Limitations / future work | §12 | Written as a ranked list already |

**Figures worth drawing** rather than quoting: the architecture diagram (§2.1);
a sequence diagram of a room join (ticket → socket → join frame → seat claim →
broadcast); a state diagram of a seat (empty → held → away with countdown →
forfeited, plus the reconnect edge); the invitation state machine
(`ok` → `taken` → `gone`); the Hard-engine fallback chain.

**Numbers worth quoting:** 5.6% complete-move accuracy on 88,704 parameters
trained for 19.4 s on 10,000 of 8.1M positions; 11 room tests plus 4 engine
tests plus 4 UI checks; 21 live end-to-end assertions; a 60-second grace period;
a 5-minute WebSocket ticket; a 7-day session and a 365-day guest identity.

**The two most defensible design arguments in the project**, if a report needs a
thesis: first, that authority over game state belongs wherever cheating is
possible — the client in single player, the server the moment a second person
appears — and second, that a seat should be owned by an identity rather than by
a connection, because everything users actually do (refreshing, losing wifi,
closing a laptop) is a connection event and almost none of it is a decision to
forfeit.
