"""Room checks. The point of a server-authoritative room is that a client
cannot do what it is not allowed to do, so most of this is about refusals.

Run: python test_rooms.py
"""

import os

# Rooms are tied to auth, so a ticket cannot be signed without this. Set it
# before anything reads config, or every join is refused and the test blocks
# forever waiting for a reply that will not come.
os.environ.setdefault("JWT_SECRET", "test-only-secret")
# And keep the suite off the network: backend/.env may name a real cluster, and
# every TestClient runs the lifespan, so each test would pay a DNS round trip
# (or a full server-selection timeout) for a database these tests never use.
os.environ.setdefault("MONGO_URI", "")

from bson import ObjectId  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import auth  # noqa: E402
import db  # noqa: E402
import main  # noqa: E402
import matchmaking  # noqa: E402
import rooms  # noqa: E402

# --------------------------------------------------------------- fake store --
# Seats need an account, and `current_identity` looks a user up before it
# believes a token. Standing in for that here keeps the suite off the network
# while still exercising the real account/guest split.

USERS: dict[ObjectId, dict] = {}
GAMES: list[dict] = []
MESSAGES: list[dict] = []


class FakeUsers:
    async def find_one(self, query):
        return USERS.get(query.get("_id"))


class FakeInserts:
    def __init__(self, sink):
        self._sink = sink

    async def insert_one(self, document):
        self._sink.append(document)
        return type("Result", (), {"inserted_id": ObjectId()})()


auth.PERSISTENCE_ENABLED = True
db.database = lambda: object()
db.users = lambda: FakeUsers()
db.games = lambda: FakeInserts(GAMES)
db.messages = lambda: FakeInserts(MESSAGES)


def account(name: str) -> tuple[str, dict]:
    """A registered user, and the Authorization header that proves it."""
    oid = ObjectId()
    USERS[oid] = {"_id": oid, "username": name, "created_at": None}
    return str(oid), {"Authorization": f"Bearer {auth.create_token(str(oid), kind='user')}"}


def account_ticket(user_id: str, name: str) -> str:
    return auth.create_ws_ticket(auth.Identity(kind="user", id=user_id, name=name))


def guest_ticket(name: str) -> str:
    guest_id, _ = auth.new_guest()
    return auth.create_ws_ticket(auth.Identity(kind="guest", id=guest_id, name=name))


def guest_headers() -> dict:
    guest_id, _ = auth.new_guest()
    return {"Authorization": f"Bearer {auth.create_token(guest_id, kind='guest')}"}


# ------------------------------------------------------------------ helpers --
# Every action broadcasts to every member, and a member that disconnects
# broadcasts from its own task, so how many messages are queued for a given
# socket at a given moment is a race. Read until the message the test actually
# cares about arrives rather than counting.

MAX_SKIPPED = 12


def join(socket, name, role, ticket):
    socket.send_json({"type": "join", "name": name, "role": role, "ticket": ticket})
    return socket.receive_json()


def expect_error(socket) -> str:
    for _ in range(MAX_SKIPPED):
        message = socket.receive_json()
        if message.get("type") == "error":
            return message["message"]
    raise AssertionError("expected a refusal, saw only state broadcasts")


def expect(socket, kind: str, until=lambda message: True) -> dict:
    for _ in range(MAX_SKIPPED):
        message = socket.receive_json()
        if message.get("type") == kind and until(message):
            return message
    raise AssertionError(f"expected a {kind} message")


def new_room(client, headers) -> str:
    response = client.post("/rooms", headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


# -------------------------------------------------------------------- tests --


def test_rooms_and_seats_need_an_account():
    with TestClient(main.app) as client:
        assert client.post("/rooms", headers=guest_headers()).status_code == 403
        assert client.post("/matchmaking", headers=guest_headers()).status_code == 403

        ada_id, ada = account("Ada")
        room_id = new_room(client, ada)

        # A guest may watch, but asking to play leaves them a watcher.
        with client.websocket_connect(f"/rooms/{room_id}/ws") as watcher:
            state = join(watcher, "Nosy", "play", guest_ticket("Nosy"))
            assert state["you"]["color"] is None
            assert state["you"]["canPlay"] is False
            assert state["seats"]["w"] is None

            watcher.send_json({"type": "sit", "color": "w"})
            assert expect_error(watcher) == "Sign in to take a seat"
    print("test_rooms_and_seats_need_an_account ok")


def test_only_the_host_can_invite():
    with TestClient(main.app) as client:
        _, ada = account("Ada")
        _, linus = account("Linus")
        room_id = new_room(client, ada)

        made = client.post(f"/rooms/{room_id}/invites", json={"kind": "play"}, headers=ada)
        assert made.status_code == 201, made.text

        refused = client.post(f"/rooms/{room_id}/invites", json={"kind": "play"}, headers=linus)
        assert refused.status_code == 403
        assert refused.json()["detail"] == "Only the host can invite"
    print("test_only_the_host_can_invite ok")


def test_a_play_invite_dies_when_the_seats_fill():
    with TestClient(main.app) as client:
        ada_id, ada = account("Ada")
        linus_id, linus = account("Linus")
        _, grace = account("Grace")
        room_id = new_room(client, ada)

        play_token = client.post(
            f"/rooms/{room_id}/invites", json={"kind": "play"}, headers=ada
        ).json()["token"]
        watch_token = client.post(
            f"/rooms/{room_id}/invites", json={"kind": "watch"}, headers=ada
        ).json()["token"]

        assert client.get(f"/invites/{play_token}", headers=linus).json()["status"] == "ok"

        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play", account_ticket(ada_id, "Ada"))
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play", account_ticket(linus_id, "Linus"))
                expect(white, "state", lambda s: s["seats"]["b"] is not None)

                # Both seats taken: the play invitation is worthless now, and
                # the host is told it arrived too late.
                late = client.get(f"/invites/{play_token}", headers=grace).json()
                assert late["status"] == "taken"
                assert late["canWatch"] is True
                assert "Grace" in expect(white, "inviteRejected")["message"]

                # Watching is never oversubscribed.
                assert client.get(f"/invites/{watch_token}", headers=grace).json()["status"] == "ok"
    print("test_a_play_invite_dies_when_the_seats_fill ok")


def test_a_refresh_keeps_your_seat_and_your_game():
    with TestClient(main.app) as client:
        ada_id, ada = account("Ada")
        linus_id, _ = account("Linus")
        room_id = new_room(client, ada)

        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play", account_ticket(ada_id, "Ada"))
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play", account_ticket(linus_id, "Linus"))
                expect(white, "state", lambda s: s["seats"]["b"] is not None)
                white.send_json({"type": "move", "uci": "e2e4"})
                expect(white, "state", lambda s: s["moves"] == ["e4"])

            # Black dropped mid-game: the seat is held, not freed.
            held = expect(white, "state", lambda s: s["seats"]["b"] is not None)
            assert held["seats"]["b"]["away"] is True

            # And coming back reclaims it, with the game intact.
            with client.websocket_connect(f"/rooms/{room_id}/ws") as again:
                state = join(again, "Linus", "watch", account_ticket(linus_id, "Linus"))
                assert state["you"]["color"] == "b", "the seat was still theirs"
                assert state["seats"]["b"]["away"] is False
                assert state["moves"] == ["e4"]
    print("test_a_refresh_keeps_your_seat_and_your_game ok")


def test_walking_away_loses_the_game():
    original = rooms.GRACE_SECONDS
    rooms.GRACE_SECONDS = 0.4
    try:
        with TestClient(main.app) as client:
            ada_id, ada = account("Ada")
            linus_id, _ = account("Linus")
            room_id = new_room(client, ada)
            GAMES.clear()

            with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
                join(white, "Ada", "play", account_ticket(ada_id, "Ada"))
                with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                    join(black, "Linus", "play", account_ticket(linus_id, "Linus"))
                    expect(white, "state", lambda s: s["seats"]["b"] is not None)
                    white.send_json({"type": "move", "uci": "e2e4"})
                    expect(white, "state", lambda s: s["moves"] == ["e4"])

                # Black leaves and does not come back.
                finished = expect(white, "state", lambda s: s["status"] == "finished")
                assert finished["result"] == "1-0", "the player still there wins"
                assert finished["termination"] == "abandoned"

            assert len(GAMES) == 2, "both sides get the game in their history"
            assert {g["player_color"]: g["outcome"] for g in GAMES} == {"w": "win", "b": "loss"}
    finally:
        rooms.GRACE_SECONDS = original
    print("test_walking_away_loses_the_game ok")


def test_the_host_right_passes_to_whoever_is_left():
    with TestClient(main.app) as client:
        ada_id, ada = account("Ada")
        linus_id, linus = account("Linus")
        room_id = new_room(client, ada)

        # Linus sits down first and stays; Ada, who opened the room, leaves.
        with client.websocket_connect(f"/rooms/{room_id}/ws") as linus_socket:
            state = join(linus_socket, "Linus", "play", account_ticket(linus_id, "Linus"))
            assert state["you"]["canInvite"] is False, "Ada opened the room"

            with client.websocket_connect(f"/rooms/{room_id}/ws") as ada_socket:
                join(ada_socket, "Ada", "play", account_ticket(ada_id, "Ada"))
                expect(linus_socket, "state", lambda s: s["seats"]["b"] is not None)

            # Ada left before a move, so her seat is released rather than held,
            # and the room follows the game: Linus inherits the right to invite.
            inherited = expect(
                linus_socket, "state", lambda s: s["you"]["canInvite"] is True
            )
            assert inherited["seats"]["b"] is None

        room = rooms.get_room(room_id)
        assert room.host_id == linus_id
        assert client.post(
            f"/rooms/{room_id}/invites", json={"kind": "play"}, headers=linus
        ).status_code == 201
    print("test_the_host_right_passes_to_whoever_is_left ok")


def test_everyone_in_the_room_can_chat():
    with TestClient(main.app) as client:
        ada_id, ada = account("Ada")
        room_id = new_room(client, ada)
        MESSAGES.clear()

        with client.websocket_connect(f"/rooms/{room_id}/ws") as player:
            join(player, "Ada", "play", account_ticket(ada_id, "Ada"))
            with client.websocket_connect(f"/rooms/{room_id}/ws") as watcher:
                join(watcher, "Nosy", "watch", guest_ticket("Nosy"))
                expect(player, "state", lambda s: "Nosy" in s["watchers"])

                # A watcher may not move, but may talk.
                watcher.send_json({"type": "chat", "text": "  good luck  "})
                for socket in (player, watcher):
                    said = expect(socket, "chat")["message"]
                    assert said["text"] == "good luck", "trimmed, and seen by everyone"
                    assert said["name"] == "Nosy"

                player.send_json({"type": "chat", "text": "   "})
                assert expect_error(player) == "Say something first"

        assert [m["text"] for m in MESSAGES] == ["good luck"], "and stored for later"
    print("test_everyone_in_the_room_can_chat ok")


def test_quick_play_pairs_two_people_into_one_room():
    with TestClient(main.app) as client:
        matchmaking.WAITING.clear()
        ada_id, ada = account("Ada")
        linus_id, linus = account("Linus")

        assert client.post("/matchmaking", headers=ada).json()["status"] == "waiting"
        assert client.get("/matchmaking", headers=ada).json()["status"] == "waiting"

        matched = client.post("/matchmaking", headers=linus).json()
        assert matched["status"] == "matched"
        room_id = matched["roomId"]

        # Whoever was waiting finds out on their next poll, and lands in the
        # same room.
        assert client.get("/matchmaking", headers=ada).json() == {
            "status": "matched",
            "roomId": room_id,
        }

        room = rooms.get_room(room_id)
        assert {room.seats["w"].owner_id, room.seats["b"].owner_id} == {ada_id, linus_id}
        assert room.status == "playing"

        # Both seats are reserved, so a third person cannot take one.
        grace_id, _ = account("Grace")
        with client.websocket_connect(f"/rooms/{room_id}/ws") as gate:
            join(gate, "Grace", "play", account_ticket(grace_id, "Grace"))
            gate.send_json({"type": "sit", "color": "w"})
            assert expect_error(gate) == "That seat is taken"
    print("test_quick_play_pairs_two_people_into_one_room ok")


def test_server_refuses_what_the_client_should_not_do():
    with TestClient(main.app) as client:
        ada_id, ada = account("Ada")
        linus_id, _ = account("Linus")
        room_id = new_room(client, ada)

        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play", account_ticket(ada_id, "Ada"))
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play", account_ticket(linus_id, "Linus"))

                black.send_json({"type": "move", "uci": "e7e5"})
                assert expect_error(black) == "Not your turn"

                white.send_json({"type": "move", "uci": "e2e5"})
                assert expect_error(white) == "That move is not legal"

                white.send_json({"type": "move", "uci": "hello"})
                assert expect_error(white) == "That is not a move"

                # White cannot take black's seat as well.
                white.send_json({"type": "sit", "color": "b"})
                assert expect_error(white) == "You are already playing"

                with client.websocket_connect(f"/rooms/{room_id}/ws") as watcher:
                    join(watcher, "Nosy", "watch", guest_ticket("Nosy"))
                    watcher.send_json({"type": "move", "uci": "e2e4"})
                    assert expect_error(watcher) == "You are watching this game"
                    watcher.send_json({"type": "resign"})
                    assert expect_error(watcher) == "You are watching this game"

                # And nobody may walk out of a game in progress.
                white.send_json({"type": "move", "uci": "e2e4"})
                expect(white, "state", lambda s: s["moves"] == ["e4"])
                white.send_json({"type": "stand"})
                assert expect_error(white) == (
                    "You cannot leave a game in progress. Resign instead."
                )
    print("test_server_refuses_what_the_client_should_not_do ok")


def test_a_room_needs_an_identity():
    """Multiplayer is tied to auth: a join without a valid ticket is closed,
    and a session token cannot stand in for one."""
    with TestClient(main.app) as client:
        ada_id, ada = account("Ada")
        room_id = new_room(client, ada)

        for bad in (None, "nonsense", auth.create_token(ada_id, kind="user")):
            try:
                with client.websocket_connect(f"/rooms/{room_id}/ws") as socket:
                    socket.send_json(
                        {"type": "join", "name": "Sneak", "role": "play", "ticket": bad}
                    )
                    socket.receive_json()
                raise AssertionError(f"ticket {bad!r} should have been refused")
            except AssertionError:
                raise
            except Exception:
                pass  # closed, which is the point

        assert rooms.get_room(room_id).seats["w"] is None
    print("test_a_room_needs_an_identity ok")


def test_unknown_room_and_invite_are_refused():
    with TestClient(main.app) as client:
        _, ada = account("Ada")
        assert client.get("/rooms/does-not-exist").status_code == 404
        assert client.get("/invites/does-not-exist", headers=ada).json()["status"] == "gone"
    print("test_unknown_room_and_invite_are_refused ok")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    print("all ok")
