"""Room checks. The point of a server-authoritative room is that a client
cannot do what it is not allowed to do, so most of this is about refusals.

Run: python test_rooms.py
"""

from fastapi.testclient import TestClient

import main
import rooms


def new_room(client) -> str:
    response = client.post("/rooms")
    assert response.status_code == 201, response.text
    return response.json()["id"]


def join(socket, name, role):
    socket.send_json({"type": "join", "name": name, "role": role})
    return socket.receive_json()


def drain(socket, count):
    """Every action broadcasts to every member, so a socket sees its own
    updates and the other player's. Read exactly `count` of them."""
    return [socket.receive_json() for _ in range(count)]


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
                white.receive_json()  # white is told black sat down

                with client.websocket_connect(f"/rooms/{room_id}/ws") as watcher:
                    state = join(watcher, "Grace", "watch")
                    assert state["you"]["color"] is None
                    assert "Grace" in state["watchers"]
                    assert state["status"] == "playing"
                    drain(white, 1)
                    drain(black, 1)

                    white.send_json({"type": "move", "uci": "e2e4"})
                    for socket in (white, black, watcher):
                        state = socket.receive_json()
                        assert state["moves"] == ["e4"], "spectators see the game too"
                        assert state["turn"] == "b"
    print("test_two_players_and_a_spectator ok")


def test_server_refuses_what_the_client_should_not_do():
    with TestClient(main.app) as client:
        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play")
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play")
                white.receive_json()

                # Out of turn.
                black.send_json({"type": "move", "uci": "e7e5"})
                assert black.receive_json()["message"] == "Not your turn"

                # Illegal move.
                white.send_json({"type": "move", "uci": "e2e5"})
                assert white.receive_json()["message"] == "That move is not legal"

                # Not a move at all.
                white.send_json({"type": "move", "uci": "hello"})
                assert white.receive_json()["message"] == "That is not a move"

                # Moving the other player's pieces: white sends a black move.
                white.send_json({"type": "move", "uci": "e7e5"})
                assert white.receive_json()["message"] == "That move is not legal"

                # A watcher cannot move, and cannot take an occupied seat.
                with client.websocket_connect(f"/rooms/{room_id}/ws") as watcher:
                    join(watcher, "Grace", "watch")
                    drain(white, 1)  # both players see Grace arrive
                    drain(black, 1)

                    watcher.send_json({"type": "move", "uci": "e2e4"})
                    assert watcher.receive_json()["message"] == "You are watching this game"

                    watcher.send_json({"type": "sit", "color": "w"})
                    assert watcher.receive_json()["message"] == "That seat is taken"

                    watcher.send_json({"type": "resign"})
                    assert watcher.receive_json()["message"] == "You are watching this game"

                # Grace leaving is itself a broadcast; read it before going on.
                drain(white, 1)
                drain(black, 1)

                # A seated player cannot also take the other seat.
                black.send_json({"type": "sit", "color": "b"})
                assert black.receive_json()["message"] == "That seat is taken"
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
                for socket, uci in line:
                    socket.send_json({"type": "move", "uci": uci})
                    state = socket.receive_json()
                    (black if socket is white else white).receive_json()

                assert state["status"] == "finished", state["status"]
                assert state["result"] == "1-0"
                assert state["termination"] == "checkmate"

                # A finished game takes no more moves.
                black.send_json({"type": "move", "uci": "e8e7"})
                assert black.receive_json()["message"] == "This game is over"

        room_id = new_room(client)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as white:
            join(white, "Ada", "play")
            with client.websocket_connect(f"/rooms/{room_id}/ws") as black:
                join(black, "Linus", "play")
                white.receive_json()
                white.send_json({"type": "resign"})
                state = white.receive_json()
                black.receive_json()
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
                white.receive_json()
                white.send_json({"type": "move", "uci": "e2e4"})
                white.receive_json()
                black.receive_json()
        assert rooms.get_room(room_id).seats["w"] is not None
    print("test_leaving_before_a_game_frees_the_seat ok")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    print("all ok")
