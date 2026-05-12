import hashlib
import os
import secrets
import base64
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_user

router = APIRouter(tags=["auth"])

T3_BASE    = "https://www.tone3000.com/api/v1"
CLIENT_ID = os.environ.get("TONE3000_KEY", "")

# Short-lived store: state_token → pkce_verifier (cleared after use)
_pending: dict[str, str] = {}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@router.get("/auth/url")
async def get_auth_url(redirect_uri: str) -> dict:
    if not CLIENT_ID:
        raise HTTPException(status_code=500, detail="TONE3000_KEY not configured")

    verifier  = secrets.token_urlsafe(48)
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    state     = secrets.token_urlsafe(16)
    _pending[state] = verifier

    params = (
        f"client_id={CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
        f"&state={state}"
    )
    return {"url": f"{T3_BASE}/oauth/authorize?{params}"}


class CallbackBody(BaseModel):
    code:         str
    state:        str
    redirect_uri: str


@router.post("/auth/callback")
async def handle_callback(body: CallbackBody) -> dict:
    verifier = _pending.pop(body.state, None)
    if not verifier:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    payload = {
        "grant_type":    "authorization_code",
        "client_id":     CLIENT_ID,
        "code":          body.code,
        "redirect_uri":  body.redirect_uri,
        "code_verifier": verifier,
    }

    async with httpx.AsyncClient() as http:
        r = await http.post(f"{T3_BASE}/oauth/token", data=payload, timeout=15.0)
    if not r.is_success:
        raise HTTPException(status_code=401, detail=f"Token exchange failed: {r.status_code} {r.text}")

    data = r.json()
    return {"access_token": data["access_token"], "refresh_token": data.get("refresh_token", "")}


class RefreshBody(BaseModel):
    refresh_token: str


@router.post("/auth/refresh")
async def refresh_token(body: RefreshBody) -> dict:
    async with httpx.AsyncClient() as http:
        payload = {"grant_type": "refresh_token", "client_id": CLIENT_ID, "refresh_token": body.refresh_token}
        r = await http.post(f"{T3_BASE}/oauth/token", data=payload, timeout=15.0)
    if not r.is_success:
        raise HTTPException(status_code=401, detail="Refresh failed")
    data = r.json()
    return {"access_token": data["access_token"], "refresh_token": data.get("refresh_token", "")}


@router.get("/auth/me")
async def me(user: Annotated[dict, Depends(require_user)]) -> dict:
    return {"id": user["id"], "tone3000_id": user["tone3000_id"], "username": user["username"]}
