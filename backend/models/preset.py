from datetime import datetime
from typing import Any
from pydantic import BaseModel


class PresetParams(BaseModel):
    gain:         float
    volume:       float
    gate:         dict[str, Any]
    eq:           dict[str, Any]
    transpose:    dict[str, Any]
    wah:          dict[str, Any]
    whammy:       dict[str, Any]
    compressor:   dict[str, Any]
    delay:        dict[str, Any]
    reverb:       dict[str, Any]
    chorus:       dict[str, Any]
    tuner_enabled: bool = False


class PresetCreate(BaseModel):
    name:            str
    position:        int  = 0
    is_public:       bool = False
    nam_tone3000_id: int  | None = None
    nam_gear_type:   str  | None = None
    cab_tone3000_id: int  | None = None
    params:          PresetParams


class PresetUpdate(BaseModel):
    name:            str          | None = None
    position:        int          | None = None
    is_public:       bool         | None = None
    nam_tone3000_id: int          | None = None
    nam_gear_type:   str          | None = None
    cab_tone3000_id: int          | None = None
    params:          PresetParams | None = None


class PresetOut(BaseModel):
    id:              str
    user_id:         str
    name:            str
    position:        int
    is_public:       bool
    nam_tone3000_id: int          | None
    nam_gear_type:   str          | None
    cab_tone3000_id: int          | None
    params:          dict[str, Any]
    created_at:      datetime
    updated_at:      datetime
