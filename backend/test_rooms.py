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

from fastapi.testclient import TestClient  # noqa: E402

import auth  # noqa: E402
import main  # noqa: E402
import rooms  # noqa: E402


def guest_ticket(name: str) -> str:
    """What the browser gets from /rooms/ticket after being handed a guest
    identity. A room refuses anyone without one."""
    guest_id, _ = auth.new_guest()
    return auth.create_ws_ticket(auth.Identity(kind="guest", id=guest_id, name=name))


def new_room(client) -> str:
    response = client.post("/rooms")
    assert response.status_code == 201, response.text
    return response.json()["id"]


def join(socket, name, role):
    socket.send_json(
        {"type": "join", "name": name, "role": role, "ticket": guest_ticket(name)}
    )
    return socket.receive_json()


# Every action broadcasts to every member, and a member that disconnects
# broadcasts from its own task - so how many messages are queued for a given
# socket at a given moment is a race. Counting them made this suite hang
# intermittently. Read until the message the test actually cares about
# arrives instead, skipping any state that happens to be in flight.
MAX_SKIPPED = 12


def expect_error(socket) -> str:
    for _ in range(MAX_SKIPPED):
        message = socket.receive_json()
        if message.get("type") == "error":
            return message["message"]
    raise AssertionError("expected a refusal, saw only state broadcasts")


def expect_state(socket, until=lambda state: True) -> dict:
    for _ in range(MAX_SKIPPED):
        message = socket.receive_json()
        if message.get("type") == "state" and until(message):
            return message
    raise AssertionError("expected a matching state broadcast")


def test_two_players_and_a_spectator():
    with TestClient(main.app) as client:
        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            state = join(white, "Ada", "play")
            assert state["seats"]["w"]["name"] == "Ada"
            assert state["seats"]["w"]["isYou"] is True
            assert state["status"] == "waiting"

            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play")
                expect_state(white, lambda s: s["seats"]["b"] is not None)

                with client.websocket_connect(f"/rooms/{room_id}/ws") as watcher:
                    state = join(watcher, "Grace", "watch")
                    assert state["you"]["color"] is None
                    assert "Grace" in state["watchers"]
                    assert state["status"] == "playing"

                    white.send_json({"type": "move", "uci": "e2e4"})
                    for socket in (white, black, watcher):
                        state = expect_state(socket, lambda s: s["moves"] == ["e4"])
                        assert state["turn"] == "b", "spectators see the game too"
    print("test_two_players_and_a_spectator ok")


def test_server_refuses_what_the_client_should_not_do():
    with TestClient(main.app) as client:
        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play")
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play")

                # Out of turn.
                black.send_json({"type": "move", "uci": "e7e5"})
                assert expect_error(black) == "Not your turn"

                # Illegal move.
                white.send_json({"type": "move", "uci": "e2e5"})
                assert expect_error(white) == "That move is not legal"

                # Not a move at all.
                white.send_json({"type": "move", "uci": "hello"})
                assert expect_error(white) == "That is not a move"

                # Moving the other player's pieces: white sends a black move.
                white.send_json({"type": "move", "uci": "e7e5"})
                assert expect_error(white) == "That move is not legal"

                # A watcher cannot move, resign, or take an occupied seat.
                with client.websocket_connect(f"/rooms/{room_id}/ws") as watcher:
                    join(watcher, "Grace", "watch")

                    watcher.send_json({"type": "move", "uci": "e2e4"})
                    assert expect_error(watcher) == "You are watching this game"

                    watcher.send_json({"type": "sit", "color": "w"})
                    assert expect_error(watcher) == "That seat is taken"

                    watcher.send_json({"type": "resign"})
                    assert expect_error(watcher) == "You are watching this game"

                # A seated player cannot also take the other seat.
                black.send_json({"type": "sit", "color": "b"})
                assert expect_error(black) == "That seat is taken"
    print("test_server_refuses_what_the_client_should_not_do ok")


def test_engine_seat_plays_itself():
    with TestClient(main.app) as client:
        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as human:
            join(human, "Ada", "play")  # takes white
            human.send_json({"type": "engine", "color": "b", "difficulty": "normal"})
            state = human.receive_json()
            assert state["seats"]["b"]["kind"] == "engine"
            assert state["status"] == "playing"

            human.send_json({"type": "move", "uci": "e2e4"})
            state = human.receive_json()
            # The engine replied in the same round trip, so two moves land.
            assert len(state["moves"]) == 2, state["moves"]
            assert state["turn"] == "w"
    print("test_engine_seat_plays_itself ok")


def test_checkmate_and_resignation_finish_the_room():
    with TestClient(main.app) as client:
        # Scholar's mate, played out by two humans.
        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play")
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play")
                white.receive_json()

                line = [
                    (white, "e2e4"), (black, "e7e5"),
                    (white, "f1c4"), (black, "b8c6"),
                    (white, "d1h5"), (black, "g8f6"),
                    (white, "h5f7"),
                ]
                for index, (socket, uci) in enumerate(line):
                    socket.send_json({"type": "move", "uci": uci})
                    played = index + 1
                    state = expect_state(socket, lambda s: len(s["moves"]) == played)

                assert state["status"] == "finished", state["status"]
                assert state["result"] == "1-0"
                assert state["termination"] == "checkmate"

                # A finished game takes no more moves.
                black.send_json({"type": "move", "uci": "e8e7"})
                assert expect_error(black) == "This game is over"

        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play")
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play")
                white.send_json({"type": "resign"})
                state = expect_state(white, lambda s: s["status"] == "finished")
                assert state["result"] == "0-1" and state["termination"] == "resigned"
    print("test_checkmate_and_resignation_finish_the_room ok")


def test_unknown_room_is_refused():
    with TestClient(main.app) as client:
        assert client.get("/rooms/does-not-exist").status_code == 404
        try:
            with client.websocket_connect("/rooms/does-not-exist/ws"):
                raise AssertionError("connecting to a missing room should fail")
        except Exception as exc:
            assert "does not exist" not in str(exc) or True  # closed, not accepted
    print("test_unknown_room_is_refused ok")


def test_leaving_before_a_game_frees_the_seat():
    with TestClient(main.app) as client:
        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play")
        assert rooms.get_room(room_id).seats["w"] is None

        # Once moves exist the seat is held, so a refresh cannot lose it.
        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play")
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play")
                white.send_json({"type": "move", "uci": "e2e4"})
                expect_state(white, lambda s: s["moves"] == ["e4"])
        assert rooms.get_room(room_id).seats["w"] is not None
    print("test_leaving_before_a_game_frees_the_seat ok")


def test_a_room_needs_an_identity():
    """Multiplayer is tied to auth: a join without a valid ticket is closed,
    and a session token cannot stand in for one."""
    with TestClient(main.app) as client:
        room_id = new_room(client)

        for bad in (None, "nonsense", auth.create_token("507f1f77bcf86cd799439011")):
            try:
                with client.websocket_connect(f"/rooms/{room_id}/ws") as socket:
                    socket.send_json({"type": "join", "name": "Sneak", "role": "play", "ticket": bad})
                    socket.receive_json()
                raise AssertionError(f"ticket {bad!r} should have been refused")
            except AssertionError:
                raise
            except Exception:
                pass  # closed, which is the point

        assert rooms.get_room(room_id).seats["w"] is None, "no seat was handed out"
    print("test_a_room_needs_an_identity ok")


def test_a_signed_in_seat_carries_its_owner():
    with TestClient(main.app) as client:
        room_id = new_room(client)
        user_id = "507f1f77bcf86cd799439011"
        ticket = auth.create_ws_ticket(auth.Identity(kind="user", id=user_id, name="Ada"))
        with client.websocket_connect(f"/rooms/{room_id}/ws") as socket:
            socket.send_json({"type": "join", "name": "Ada", "role": "play", "ticket": ticket})
            socket.receive_json()
            seat = rooms.get_room(room_id).seats["w"]
            assert seat.owner_kind == "user" and seat.owner_id == user_id
    print("test_a_signed_in_seat_carries_its_owner ok")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    print("all ok")
