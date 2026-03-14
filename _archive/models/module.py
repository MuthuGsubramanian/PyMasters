"""Learning module related domain models."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class Lesson(BaseModel):
    id: int
    module_id: int
    title: str
    lesson_type: str
    order_index: int
    content: str
    resources: Optional[List[str]] = None


class Exercise(BaseModel):
    id: int
    lesson_id: int
    prompt: str
    starter_code: str
    solution_code: Optional[str] = None
    unit_tests: Optional[List[dict]] = None


class Module(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    tags: List[str]
    difficulty: str
    description: str
    hero_image: Optional[str] = None
    estimated_minutes: int
    lessons: Optional[List[Lesson]] = None
