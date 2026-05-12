import time
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import Header, HTTPException

from db.connection import get_db

T3_USER_URL = "https://www.tone3000.com/api/v1/user"

_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 300


async def require_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ")

    cached = _cache.get(token)
    if cached and time.monotonic() < cached[1]:
        return cached[0]

    async with httpx.AsyncClient() as http:
        try:
            r = await http.get(T3_USER_URL, headers={"Authorization": f"Bearer {token}"}, timeout=10.0)
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Could not reach tone3000")

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid tone3000 token")

    t3    = r.json()
    t3_id = str(t3["id"])

    db = get_db()
    await db.users.update_one(
        {"_id": t3_id},
        {"$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    user = {
        "id":          t3_id,
        "tone3000_id": t3_id,
        "username":    t3.get("username", ""),
        "token":       token,
    }
    _cache[token] = (user, time.monotonic() + _CACHE_TTL)
    return user
