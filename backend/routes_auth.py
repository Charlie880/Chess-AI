"""Registration and login."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

import db
from auth import (
    Identity,
    create_token,
    current_identity,
    new_guest,
    public_identity,
    hash_password,
    public_user,
    require_persistence,
    validate_password,
    verify_against_decoy,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,24}$")
# Deliberately loose. This is a "did you fumble the keyboard" check, not an
# attempt to out-parse RFC 5322, and nothing yet depends on the address being
# deliverable - there is no verification mail and no reset flow.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]+$")


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=1, max_length=256)


class Registration(Credentials):
    """The sign-up screen collects an address, so the account stores one rather
    than the form quietly throwing it away. Optional, and not unique: nothing
    reads it yet."""

    email: str | None = Field(default=None, max_length=254)


@router.post("/register")
async def register(body: Registration):
    require_persistence()
    username = body.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Username must be 3-24 characters: letters, digits, _ or -")
    validate_password(body.password)

    email = (body.email or "").strip().lower() or None
    if email and not EMAIL_RE.match(email):
        raise HTTPException(400, "That does not look like an email address")

    document = {
        "username": username,
        "email": email,
        # Uniqueness and lookup both run on the folded form, so Alice and alice
        # are the same account. `username` keeps the casing they typed.
        "username_lower": username.lower(),
        "password_hash": await hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await db.users().insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(409, "That username is taken")

    document["_id"] = result.inserted_id
    return {
        "token": create_token(str(result.inserted_id), kind="user"),
        "user": {"kind": "user", **public_user(document)},
    }


@router.post("/login")
async def login(body: Credentials):
    require_persistence()
    user = await db.users().find_one({"username_lower": body.username.strip().lower()})

    # Same message and the same work either way, so neither the response nor
    # how long it took reveals whether the account exists.
    if user is None:
        await verify_against_decoy(body.password)
        raise HTTPException(401, "Incorrect username or password")
    if not await verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect username or password")

    return {
        "token": create_token(str(user["_id"]), kind="user"),
        "user": {"kind": "user", **public_user(user)},
    }


@router.post("/guest")
def guest():
    """Mint an identity for someone who has not signed up. Rooms are tied to
    auth, and this is what lets "anyone with the link" still mean somebody:
    the id lives in a long-lived cookie, so their games keep accruing to them
    across visits without an account."""
    guest_id, name = new_guest()
    return {
        "token": create_token(guest_id, kind="guest"),
        "user": {"kind": "guest", "id": guest_id, "username": name},
    }


@router.get("/me")
async def me(identity: Identity = Depends(current_identity)):
    return public_identity(identity)
