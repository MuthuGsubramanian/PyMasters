"""User domain model."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    password: str
    skill_level: str
    learning_goals: List[str]
    avatar_url: Optional[str] = None
