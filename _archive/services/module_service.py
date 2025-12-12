"""Service responsible for module and lesson retrieval."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List

from models import Exercise, Lesson, Module


class ModuleService:
    def __init__(
        self,
        module_seed: Path | str = "data/seed/modules.json",
        lesson_seed: Path | str = "data/seed/lessons.json",
        exercise_seed: Path | str = "data/seed/exercises.json",
    ) -> None:
        self._module_seed = Path(module_seed)
        self._lesson_seed = Path(lesson_seed)
        self._exercise_seed = Path(exercise_seed)
        self._modules = [Module(**payload) for payload in self._load_json(self._module_seed)]
        self._lessons = [Lesson(**payload) for payload in self._load_json(self._lesson_seed)]
        self._exercises = [Exercise(**payload) for payload in self._load_json(self._exercise_seed)]

    def _load_json(self, path: Path) -> Iterable[dict]:
        return json.loads(path.read_text(encoding="utf-8"))

    def list_modules(self) -> List[Module]:
        return list(self._modules)

    def list_lessons(self) -> List[Lesson]:
        return list(self._lessons)

    def list_exercises(self) -> List[Exercise]:
        return list(self._exercises)

    def get_module(self, module_id: int) -> Module | None:
        for module in self._modules:
            if module.id == module_id:
                module.lessons = [lesson for lesson in self._lessons if lesson.module_id == module_id]
                return module
        return None
