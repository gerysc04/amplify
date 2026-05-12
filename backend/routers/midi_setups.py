from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from auth import require_user
from db.connection import get_db
from models.midi import MidiSetupCreate, MidiSetupOut, MidiSetupUpdate

router = APIRouter(tags=["midi"])


def _to_out(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = doc.pop("_id")
    return doc


@router.get("/midi-setups", response_model=list[MidiSetupOut])
async def list_setups(user: Annotated[dict, Depends(require_user)]):
    db     = get_db()
    cursor = db.midi_setups.find({"user_id": user["id"]}).sort("created_at", 1)
    return [_to_out(d) for d in await cursor.to_list(length=None)]


@router.post("/midi-setups", response_model=MidiSetupOut, status_code=201)
async def create_setup(body: MidiSetupCreate, user: Annotated[dict, Depends(require_user)]):
    db  = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "_id":       str(uuid4()),
        "user_id":   user["id"],
        "name":      body.name,
        "is_active": False,
        "mappings":  [],
        "created_at": now,
        "updated_at": now,
    }
    await db.midi_setups.insert_one(doc)
    return _to_out(doc)


@router.put("/midi-setups/{setup_id}", response_model=MidiSetupOut)
async def update_setup(
    setup_id: str,
    body: MidiSetupUpdate,
    user: Annotated[dict, Depends(require_user)],
):
    db  = get_db()
    doc = await db.midi_setups.find_one({"_id": setup_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404)

    updates = body.model_dump(exclude_none=True)
    if "mappings" in updates:
        updates["mappings"] = [m if isinstance(m, dict) else m.model_dump() for m in body.mappings]

    # If activating this setup, deactivate all others
    if updates.get("is_active"):
        await db.midi_setups.update_many(
            {"user_id": user["id"], "_id": {"$ne": setup_id}},
            {"$set": {"is_active": False}},
        )

    updates["updated_at"] = datetime.now(timezone.utc)
    await db.midi_setups.update_one({"_id": setup_id}, {"$set": updates})
    updated = await db.midi_setups.find_one({"_id": setup_id})
    return _to_out(updated)


@router.delete("/midi-setups/{setup_id}", status_code=204)
async def delete_setup(setup_id: str, user: Annotated[dict, Depends(require_user)]):
    db     = get_db()
    result = await db.midi_setups.delete_one({"_id": setup_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404)
