"""MongoDB access. One client for the process, opened on startup."""

import logging

from pymongo import AsyncMongoClient, ASCENDING, DESCENDING

from config import MONGO_DB, MONGO_URI, PERSISTENCE_ENABLED

log = logging.getLogger(__name__)

_client: AsyncMongoClient | None = None
_db = None


async def connect() -> None:
    """Open the connection and make sure the indexes exist. Safe to call twice.

    Never raises: an unreachable database must not take the engine endpoints
    down with it. On failure persistence stays off and /auth and /games say so.
    """
    global _client, _db
    if not PERSISTENCE_ENABLED or _db is not None:
        return

    client = AsyncMongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    try:
        await client.admin.command("ping")

        database = client[MONGO_DB]
        # Uniqueness lives in the index, not in an application-level check — a
        # check-then-insert races two concurrent registrations of the same name.
        await database.users.create_index([("username_lower", ASCENDING)], unique=True)
        await database.games.create_index([("user_id", ASCENDING), ("started_at", DESCENDING)])
        # Guests own games too, keyed by the id in their cookie rather than
        # a user record.
        await database.games.create_index([("guest_id", ASCENDING), ("started_at", DESCENDING)])
    except Exception as exc:
        await client.close()
        log.warning("MongoDB unavailable, accounts and history are off: %s", exc)
        return

    _client, _db = client, database
    log.info("Connected to MongoDB database %r", MONGO_DB)


async def close() -> None:
    global _client, _db
    if _client is not None:
        await _client.close()
        _client, _db = None, None


def database():
    """None when persistence is off, so callers can degrade instead of crashing."""
    return _db


def users():
    db = database()
    return None if db is None else db.users


def games():
    db = database()
    return None if db is None else db.games
