"""Password hashing, JWT issuing, and the current-user dependency."""

from datetime import datetime, timedelta, timezone

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


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def require_persistence() -> None:
    if not PERSISTENCE_ENABLED:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Accounts and history are disabled: set MONGO_URI and JWT_SECRET in backend/.env",
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
