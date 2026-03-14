"""Practice and challenge layout."""
from __future__ import annotations

import random
from datetime import date

import streamlit as st

from components import render_code_runner

CHALLENGES = [
    {
        "title": "Daily warm-up",
        "prompt": "Implement a function that returns the Fibonacci sequence up to N.",
        "starter_code": "def fibonacci(n: int) -> list[int]:\n    sequence = []\n    return sequence",
        "unit_tests": [
            {"input": "fibonacci(5)", "expected": "[0, 1, 1, 2, 3]"},
        ],
    },
    {
        "title": "Data wrangling kata",
        "prompt": "Given a list of dictionaries with sales data, aggregate totals per region.",
        "starter_code": "def aggregate_sales(rows):\n    ...",
        "unit_tests": [],
    },
]


def render_practice_arena() -> None:
    """Render the interactive practice arena with streak mechanics."""

    st.title("Practice Arena")
    st.caption("Sharpen your skills with curated daily challenges and community leaderboards.")

    challenge = random.choice(CHALLENGES)
    st.subheader(f"{challenge['title']} · {date.today():%b %d}")
    render_code_runner(
        prompt=challenge["prompt"],
        starter_code=challenge["starter_code"],
        unit_tests=challenge.get("unit_tests", []),
        key="practice",
    )

    st.markdown("---")
    st.subheader("Community leaderboard")
    leaderboard_data = [
        {"name": "Jane Developer", "score": 980},
        {"name": "Sam Analyst", "score": 760},
        {"name": "Lee Data", "score": 640},
    ]
    st.table(leaderboard_data)
