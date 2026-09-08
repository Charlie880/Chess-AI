"""Registration and login."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

import db
from auth import (
    create_token,
    current_user,
    hash_password,
    public_user,
    require_persistence,
    validate_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,24}$")


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=1, max_length=256)


@router.post("/register")
async def register(body: Credentials):
    require_persistence()
    username = body.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Username must be 3-24 characters: letters, digits, _ or -")
    validate_password(body.password)

    document = {
        "username": username,
        "username_lower": username.lower(),
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await db.users().insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(409, "That username is taken")

    document["_id"] = result.inserted_id
    return {"token": create_token(str(result.inserted_id)), "user": public_user(document)}


@router.post("/login")
async def login(body: Credentials):
    require_persistence()
    user = await db.users().find_one({"username": body.username.strip()})

    # Same message and roughly the same work either way, so the response does
    # not reveal whether the account exists.
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect username or password")

    return {"token": create_token(str(user["_id"])), "user": public_user(user)}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)
