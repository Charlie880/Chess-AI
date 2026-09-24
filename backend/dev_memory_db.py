"""Run the API with an in-memory database, for when there is no Mongo to hand.

    python dev_memory_db.py            # http://0.0.0.0:8000

Accounts, game history and chat all work and are thrown away when the process
exits. This exists so the multiplayer flow - which needs real accounts - can be
exercised end to end without standing up a cluster first. It is a development
convenience and nothing else: `main.py` is what runs for real.
"""

import os

os.environ.setdefault("JWT_SECRET", "dev-only-in-memory-secret")
os.environ.setdefault("MONGO_URI", "")  # keep the lifespan off the network

import mongomock  # noqa: E402

import auth  # noqa: E402
import db  # noqa: E402
import rooms  # noqa: E402

# A minute of grace is right in production and tedious to sit through by hand.
rooms.GRACE_SECONDS = float(os.environ.get("MESS_GRACE", rooms.GRACE_SECONDS))

_store = mongomock.MongoClient()["chess_ai"]
_store.users.create_index("username_lower", unique=True)


class AsyncCursor:
    """mongomock is synchronous; the app awaits. Thin enough to be honest."""

    def __init__(self, cursor):
        self._cursor = cursor

    def sort(self, *args):
        self._cursor = self._cursor.sort(*args)
        return self

    def skip(self, n):
        self._cursor = self._cursor.skip(n)
        return self

    def limit(self, n):
        self._cursor = self._cursor.limit(n)
        return self

    def __aiter__(self):
        self._rows = iter(list(self._cursor))
        return self

    async def __anext__(self):
        try:
            return next(self._rows)
        except StopIteration:
            raise StopAsyncIteration


class AsyncCollection:
    def __init__(self, collection):
        self._collection = collection

    def find(self, *args, **kwargs):
        return AsyncCursor(self._collection.find(*args, **kwargs))

    async def aggregate(self, *args, **kwargs):
        return AsyncCursor(self._collection.aggregate(*args, **kwargs))

    def __getattr__(self, name):
        target = getattr(self._collection, name)

        async def call(*args, **kwargs):
            return target(*args, **kwargs)

        return call


auth.PERSISTENCE_ENABLED = True
db.database = lambda: _store
db.users = lambda: AsyncCollection(_store.users)
db.games = lambda: AsyncCollection(_store.games)
db.messages = lambda: AsyncCollection(_store.messages)

import main  # noqa: E402  (imported after the patch so the app sees it)

if __name__ == "__main__":
    import uvicorn

    print("In-memory database. Accounts and history live only as long as this process.")
    uvicorn.run(main.app, host="0.0.0.0", port=8000, log_level="warning")
