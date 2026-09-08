"""MongoDB access. One client for the process, opened on startup."""

import logging

from pymongo import AsyncMongoClient, ASCENDING, DESCENDING

from config import MONGO_DB, MONGO_URI, PERSISTENCE_ENABLED

log = logging.getLogger(__name__)

_client: AsyncMongoClient | None = None
_db = None


async def connect() -> None:
    """Open the connection and make sure the indexes exist. Safe to call twice."""
    global _client, _db
    if not PERSISTENCE_ENABLED or _client is not None:
        return

    _client = AsyncMongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    _db = _client[MONGO_DB]

    # Uniqueness lives in the index, not in an application-level check — a
    # check-then-insert races two concurrent registrations of the same name.
    await _db.users.create_index([("username", ASCENDING)], unique=True)
    await _db.games.create_index([("user_id", ASCENDING), ("started_at", DESCENDING)])

    await _client.admin.command("ping")
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
