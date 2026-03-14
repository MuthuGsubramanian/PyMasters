"""Layouts dedicated to learning module exploration and lesson playback."""
from __future__ import annotations

from typing import Iterable

import streamlit as st

from components import render_code_runner


def render_learning_paths(
    *,
    modules: Iterable[dict],
    lessons: Iterable[dict],
    exercises: Iterable[dict],
) -> None:
    """Render the learning path browser and lesson viewer."""

    modules = list(modules)
    lessons = list(lessons)
    exercises = list(exercises)

    st.title("Learning Paths")
    st.caption("Curated journeys to help you master Python from fundamentals to production-ready code.")

    tag_options = sorted({tag for module in modules for tag in module.get("tags", [])})
    selected_tags = st.multiselect("Filter by tags", tag_options, default=[])

    filtered_modules = [
        module
        for module in modules
        if not selected_tags or any(tag in selected_tags for tag in module.get("tags", []))
    ]

    for module in filtered_modules:
        with st.expander(f"{module['title']} · {module['difficulty']}", expanded=False):
            st.write(module["description"])
            related_lessons = [lesson for lesson in lessons if lesson["module_id"] == module["id"]]
            lesson_titles = [lesson["title"] for lesson in related_lessons]
            selected_lesson_title = st.selectbox(
                "Choose a lesson", lesson_titles, key=f"lesson-select-{module['id']}"
            ) if lesson_titles else None

            if selected_lesson_title:
                lesson = next(lesson for lesson in related_lessons if lesson["title"] == selected_lesson_title)
                st.markdown(lesson["content"])
                for resource in lesson.get("resources", []):
                    st.markdown(f"- [{resource}]({resource})")

                related_exercises = [ex for ex in exercises if ex["lesson_id"] == lesson["id"]]
                if related_exercises:
                    st.markdown("---")
                    for exercise in related_exercises:
                        render_code_runner(
                            prompt=exercise["prompt"],
                            starter_code=exercise["starter_code"],
                            unit_tests=exercise.get("unit_tests", []),
                            key=f"exercise-{exercise['id']}",
                        )
                else:
                    st.info("This lesson does not yet include interactive exercises. Stay tuned!")
