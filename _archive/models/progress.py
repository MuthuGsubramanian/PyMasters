"""Progress related models."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProgressRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    module_id: int
    completion_pct: float
    last_accessed: datetime
