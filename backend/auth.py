"""Password hashing, JWT issuing, and the current-user dependency."""

from datetime import datetime, timedelta, timezone
from functools import lru_cache

import anyio.to_thread
import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import db
from config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET, PERSISTENCE_ENABLED

# bcrypt hashes at most 72 bytes and silently ignores the rest, which would
# make "<72 correct bytes> + anything" a valid password. Reject instead.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8

_bearer = HTTPBearer(auto_error=False)


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise HTTPException(400, f"Password must be at most {MAX_PASSWORD_BYTES} bytes")


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# bcrypt deliberately costs ~100-300ms. Run it off the event loop, or a handful
# of concurrent sign-ins stalls every other request on the process, /move
# included.
async def hash_password(password: str) -> str:
    return await anyio.to_thread.run_sync(_hash, password)


async def verify_password(password: str, password_hash: str) -> bool:
    return await anyio.to_thread.run_sync(_verify, password, password_hash)


@lru_cache(maxsize=1)
def _decoy_hash() -> str:
    """A real hash to check against when the username does not exist, so a
    failed login costs the same either way. Without it, a miss returns in ~1ms
    and a hit in ~200ms, which reliably enumerates accounts."""
    return _hash("no-such-account")


async def verify_against_decoy(password: str) -> None:
    await verify_password(password, _decoy_hash())


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


# A room's WebSocket runs against the API directly, not through the Next
# proxy, so the httpOnly session cookie cannot be relied on to reach it. The
# client asks the proxy for one of these instead: short-lived, single purpose,
# and useless for anything but naming who is sitting down.
WS_TICKET_MINUTES = 5


def create_ws_ticket(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "scope": "ws", "iat": now, "exp": now + timedelta(minutes=WS_TICKET_MINUTES)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def read_ws_ticket(ticket: str | None) -> str | None:
    """The user id a ticket names, or None if it is missing, expired, forged,
    or a session token being passed off as a ticket."""
    if not ticket or not JWT_SECRET:
        return None
    try:
        payload = jwt.decode(ticket, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("scope") != "ws":
        return None
    return payload.get("sub")


def require_persistence() -> None:
    """503 with the reason. Config missing and database unreachable are
    different problems and need different fixes."""
    if not PERSISTENCE_ENABLED:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Accounts and history are disabled: set MONGO_URI and JWT_SECRET in backend/.env",
        )
    if db.database() is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The database is not reachable. Check MONGO_URI and that the server is running.",
        )


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    require_persistence()
    if credentials is None:
        raise HTTPException(401, "Not authenticated")

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = ObjectId(payload["sub"])
    except (jwt.PyJWTError, InvalidId, KeyError):
        raise HTTPException(401, "Invalid or expired token")

    user = await db.users().find_one({"_id": user_id})
    if user is None:
        raise HTTPException(401, "Invalid or expired token")
    return user


def public_user(user: dict) -> dict:
    """Never let the hash leave the process."""
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "createdAt": user["created_at"].isoformat(),
    }
