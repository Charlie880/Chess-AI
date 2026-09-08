"""Password hashing, JWT issuing, and the current-user dependency."""

import secrets
from dataclasses import dataclass
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


# Everyone who plays has an identity, so every game has an owner. An account
# is one kind; a guest is the other, carrying a random id that lives in a
# long-lived cookie so their history survives closing the tab.
GUEST_EXPIRE_DAYS = 365


@dataclass
class Identity:
    kind: str  # "user" | "guest"
    id: str
    name: str
    document: dict | None = None  # the Mongo user record, for accounts


def create_token(subject: str, kind: str = "user") -> str:
    now = datetime.now(timezone.utc)
    lifetime = (
        timedelta(days=GUEST_EXPIRE_DAYS)
        if kind == "guest"
        else timedelta(minutes=JWT_EXPIRE_MINUTES)
    )
    return jwt.encode(
        {"sub": subject, "kind": kind, "iat": now, "exp": now + lifetime},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def new_guest() -> tuple[str, str]:
    """(guest id, display name). The id is a bearer credential in a cookie, so
    it needs the entropy of one."""
    guest_id = secrets.token_urlsafe(16)
    return guest_id, f"Guest {guest_id[:4]}"


def guest_name(guest_id: str) -> str:
    return f"Guest {guest_id[:4]}"


# A room's WebSocket runs against the API directly, not through the Next
# proxy, so the httpOnly session cookie cannot be relied on to reach it. The
# client asks the proxy for one of these instead: short-lived, single purpose,
# and useless for anything but naming who is sitting down.
WS_TICKET_MINUTES = 5


def create_ws_ticket(identity: Identity) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": identity.id,
            "kind": identity.kind,
            "name": identity.name,
            "scope": "ws",
            "iat": now,
            "exp": now + timedelta(minutes=WS_TICKET_MINUTES),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def read_ws_ticket(ticket: str | None) -> Identity | None:
    """The identity a ticket names, or None if it is missing, expired, forged,
    or a session token being passed off as a ticket."""
    if not ticket or not JWT_SECRET:
        return None
    try:
        payload = jwt.decode(ticket, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("scope") != "ws":
        return None
    kind = payload.get("kind")
    subject = payload.get("sub")
    if kind not in ("user", "guest") or not subject:
        return None
    return Identity(kind=kind, id=subject, name=payload.get("name") or "Player")


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


def _decode(token: str) -> dict:
    if not JWT_SECRET:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Identity is disabled: set JWT_SECRET in backend/.env",
        )
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")


async def current_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Identity:
    """An account or a guest. Guests need no database, so a room still works
    when Mongo is down; only reading and writing history needs it."""
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    payload = _decode(credentials.credentials)
    subject = payload.get("sub")
    if not subject:
        raise HTTPException(401, "Invalid or expired token")

    if payload.get("kind") == "guest":
        return Identity(kind="guest", id=subject, name=guest_name(subject))

    require_persistence()
    try:
        user = await db.users().find_one({"_id": ObjectId(subject)})
    except InvalidId:
        raise HTTPException(401, "Invalid or expired token")
    if user is None:
        raise HTTPException(401, "Invalid or expired token")
    return Identity(kind="user", id=str(user["_id"]), name=user["username"], document=user)


async def current_user(identity: Identity = Depends(current_identity)) -> dict:
    """For the routes that genuinely need a registered account."""
    if identity.kind != "user" or identity.document is None:
        raise HTTPException(403, "That needs a registered account")
    return identity.document


def public_user(user: dict) -> dict:
    """Never let the hash leave the process."""
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "createdAt": user["created_at"].isoformat(),
    }


def public_identity(identity: Identity) -> dict:
    if identity.kind == "user" and identity.document is not None:
        return {"kind": "user", **public_user(identity.document)}
    return {"kind": "guest", "id": identity.id, "username": identity.name}
