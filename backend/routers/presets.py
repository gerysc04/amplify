from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from auth import require_user
from db.connection import get_db
from models.preset import PresetCreate, PresetOut, PresetUpdate

router = APIRouter(tags=["presets"])


def _to_out(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = doc.pop("_id")
    return doc


@router.get("/presets", response_model=list[PresetOut])
async def list_presets(user: Annotated[dict, Depends(require_user)]):
    db     = get_db()
    cursor = db.presets.find({"user_id": user["id"]}).sort([("position", 1), ("created_at", 1)])
    docs   = await cursor.to_list(length=None)
    return [_to_out(d) for d in docs]


@router.post("/presets", response_model=PresetOut, status_code=201)
async def create_preset(body: PresetCreate, user: Annotated[dict, Depends(require_user)]):
    db  = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "_id":             str(uuid4()),
        "user_id":         user["id"],
        "name":            body.name,
        "position":        body.position,
        "is_public":       body.is_public,
        "nam_tone3000_id": body.nam_tone3000_id,
        "nam_gear_type":   body.nam_gear_type,
        "cab_tone3000_id": body.cab_tone3000_id,
        "params":          body.params.model_dump(),
        "created_at":      now,
        "updated_at":      now,
    }
    await db.presets.insert_one(doc)
    return _to_out(doc)


@router.put("/presets/{preset_id}", response_model=PresetOut)
async def update_preset(
    preset_id: str,
    body: PresetUpdate,
    user: Annotated[dict, Depends(require_user)],
):
    db  = get_db()
    doc = await db.presets.find_one({"_id": preset_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404)

    updates = body.model_dump(exclude_none=True)
    if "params" in updates:
        updates["params"] = body.params.model_dump()  # type: ignore[union-attr]
    updates["updated_at"] = datetime.now(timezone.utc)

    await db.presets.update_one({"_id": preset_id}, {"$set": updates})
    updated = await db.presets.find_one({"_id": preset_id})
    return _to_out(updated)


@router.delete("/presets/{preset_id}", status_code=204)
async def delete_preset(preset_id: str, user: Annotated[dict, Depends(require_user)]):
    db     = get_db()
    result = await db.presets.delete_one({"_id": preset_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404)
