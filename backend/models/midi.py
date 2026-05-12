from typing import Any
from pydantic import BaseModel


class MidiMappingModel(BaseModel):
    id:      str
    cc:      int
    channel: int = 0
    action:  dict[str, Any]


class MidiSetupCreate(BaseModel):
    name: str


class MidiSetupUpdate(BaseModel):
    name:      str            | None = None
    is_active: bool           | None = None
    mappings:  list[MidiMappingModel] | None = None


class MidiSetupOut(BaseModel):
    id:        str
    user_id:   str
    name:      str
    is_active: bool
    mappings:  list[dict[str, Any]]
