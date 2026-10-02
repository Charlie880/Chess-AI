"""End to end: queue pairing -> a played game with chat -> a guest browsing and
replaying it. Runs the real app over an in-memory Mongo (mongomock).

Run: python test_replay.py
"""

import os
import time

os.environ.setdefault("JWT_SECRET", "test-only-secret")
os.environ.setdefault("MONGO_URI", "")

from fastapi.testclient import TestClient  # noqa: E402

import dev_memory_db  # noqa: E402,F401  (patches db and auth for the in-memory store)
import main  # noqa: E402

MAX_SKIPPED = 15


def expect(socket, kind, until=lambda m: True):
    for _ in range(MAX_SKIPPED):
        message = socket.receive_json()
        if message.get("type") == kind and until(message):
            return message
    raise AssertionError(f"expected a {kind} message")


def register(client, name):
    r = client.post("/auth/register", json={"username": name, "password": "password123"})
    assert r.status_code in (200, 201), r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_queue_game_chat_and_guest_replay():
    with TestClient(main.app) as client:
        ada, bob = register(client, "ada_q"), register(client, "bob_q")

        assert client.post("/matchmaking", headers=ada).json()["status"] == "waiting"
        matched = client.post("/matchmaking", headers=bob).json()
        assert matched["status"] == "matched", matched
        room_id = matched["roomId"]
        assert client.get("/matchmaking", headers=ada).json()["roomId"] == room_id

        def ticket(headers):
            return client.post("/rooms/ticket", headers=headers).json()

        ta, tb = ticket(ada), ticket(bob)
        with client.websocket_connect(f"/rooms/{room_id}/ws") as sa, client.websocket_connect(
            f"/rooms/{room_id}/ws"
        ) as sb:
            sa.send_json({"type": "join", "name": "ada_q", "role": "play", "ticket": ta["ticket"]})
            state_a = expect(sa, "state")
            sb.send_json({"type": "join", "name": "bob_q", "role": "play", "ticket": tb["ticket"]})
            state_b = expect(sb, "state")
            colors = {state_a["you"]["color"]: sa, state_b["you"]["color"]: sb}
            assert set(colors) == {"w", "b"}, colors
            white, black = colors["w"], colors["b"]

            def say(socket, text):
                socket.send_json({"type": "chat", "text": text})
                time.sleep(0.05)

            say(white, "good luck")
            white.send_json({"type": "move", "uci": "e2e4"})
            time.sleep(0.05)
            say(black, "nice opening")
            black.send_json({"type": "move", "uci": "e7e5"})
            time.sleep(0.05)
            say(white, "gg")
            white.send_json({"type": "resign"})
            expect(black, "state", lambda m: m["status"] == "finished")
            time.sleep(0.2)

            # A second game in the same room must not leak into the first replay.
            white.send_json({"type": "newGame"})
            expect(black, "state", lambda m: m["status"] == "playing")
            say(black, "rematch chat")
            time.sleep(0.1)

        # A guest, who cannot play, can still browse and open the finished game.
        guest = client.post("/auth/guest").json()
        guest_headers = {"Authorization": f"Bearer {guest['token']}"}
        listing = client.get("/games/public", headers=guest_headers).json()
        assert len(listing) == 1, listing
        entry = listing[0]
        assert entry["moves"] == ["e4", "e5"] and entry["termination"] == "resigned"

        detail = client.get(f"/games/{entry['id']}", headers=guest_headers).json()
        assert [m["text"] for m in detail["chat"]] == ["good luck", "nice opening", "gg"], detail["chat"]
        assert len(detail["moveTimes"]) == 2
        # Chat lines carry timestamps that interleave with the moves.
        at = [m["at"] for m in detail["chat"]]
        t = detail["moveTimes"]
        assert at[0] < t[0] < at[1] < t[1] < at[2]
        assert detail["whiteName"] and detail["blackName"]

        # Both players keep their own copy, so each sees it in personal history too.
        for headers in (ada, bob):
            mine = client.get("/games", headers=headers).json()
            assert len(mine) == 1 and mine[0]["id"]

        # Unfinished or engine games are not public.
        assert client.get("/games/000000000000000000000000", headers=guest_headers).status_code == 404
    print("test_queue_game_chat_and_guest_replay ok")


if __name__ == "__main__":
    test_queue_game_chat_and_guest_replay()
