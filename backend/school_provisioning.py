"""
school_provisioning.py — Multi-tenant school schema migrations, board/grade
syllabus catalog seeding (STATE, MATRIC, CBSE, ICSE, IB across Grades 6–12),
2026–27 Computer Science & Question Bank integration, and cohort scoping helpers.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import uuid
from typing import Any


BOARDS = ("STATE", "MATRIC", "CBSE", "ICSE", "IB")
GRADES = (6, 7, 8, 9, 10, 11, 12)

BOARD_ALIASES: dict[str, str] = {
    "STATE": "STATE",
    "STATE_BOARD": "STATE",
    "STATEBOARD": "STATE",
    "SAMACHEER": "STATE",
    "SAMACHEER_KALVI": "STATE",
    "TN_STATE": "STATE",
    "SCERT": "STATE",
    "MATRIC": "MATRIC",
    "METRIC": "MATRIC",
    "MATRICULATION": "MATRIC",
    "TN_MATRIC": "MATRIC",
    "CBSE": "CBSE",
    "NCERT": "CBSE",
    "ICSE": "ICSE",
    "CISCE": "ICSE",
    "ISC": "ICSE",
    "IB": "IB",
}

_SUBJECT_KEY_TO_CODE: dict[str, str] = {
    "computer_science": "cs_ai",
    "cs_ai": "cs_ai",
    "mathematics": "mathematics",
    "physics": "physics",
    "chemistry": "chemistry",
    "biology": "biology",
    "social_studies": "social_studies",
}

_CODE_TO_SUBJECT_KEY: dict[str, str] = {
    "cs_ai": "computer_science",
    "computer_science": "computer_science",
    "mathematics": "mathematics",
    "physics": "physics",
    "chemistry": "chemistry",
    "biology": "biology",
    "social_studies": "social_studies",
}

_CS_CATALOG_PATH = Path(__file__).resolve().parent / "data" / "school_cs_syllabus_2026_27.json"
_cs_catalog_cache: dict[str, Any] | None = None


def normalize_board(raw: str) -> str:
    """Normalize board code or common Indian school aliases ('METRIC', 'SAMACHEER', etc.)."""
    key = (raw or "").strip().upper().replace("-", "_").replace(" ", "_")
    resolved = BOARD_ALIASES.get(key)
    if not resolved or resolved not in BOARDS:
        raise ValueError(f"Unsupported board '{raw}'. Must be one of {', '.join(BOARDS)}.")
    return resolved


def _load_cs_syllabus_catalog() -> dict[str, Any]:
    """Load the 2026–27 4-board school syllabus & question bank catalog once per process."""
    global _cs_catalog_cache
    if _cs_catalog_cache is not None:
        return _cs_catalog_cache
    if not _CS_CATALOG_PATH.exists():
        _cs_catalog_cache = {}
        return _cs_catalog_cache
    with open(_CS_CATALOG_PATH, "r", encoding="utf-8") as fh:
        _cs_catalog_cache = json.load(fh)
    return _cs_catalog_cache

# Maps school grade brackets to existing runnable Python / AI lessons in backend/lessons/
_CS_LESSONS_BY_GRADE: dict[int, list[tuple[str, str, str]]] = {
    6: [
        ("variables_intro", "Term 1", "Magic Boxes: Variables & Values"),
        ("variables_types", "Term 1", "Data Types: Numbers & Text"),
        ("conditionals", "Term 2", "Making Decisions with if/else"),
        ("for_loops", "Term 2", "Repeating Patterns with Loops"),
    ],
    7: [
        ("variables_intro", "Term 1", "Variables & Expressions"),
        ("conditionals", "Term 1", "Branching & Logic Gates"),
        ("for_loops", "Term 1", "For Loops & Counting"),
        ("lists", "Term 2", "Organizing Data in Lists"),
        ("functions_basics", "Term 2", "Reusable Functions"),
    ],
    8: [
        ("variables_intro", "Term 1", "Variables, Memory & Naming"),
        ("conditionals", "Term 1", "Conditional Thinking in Code"),
        ("for_loops", "Term 1", "Iteration & Pattern Lab"),
        ("lists", "Term 2", "Lists & Sequence Algorithms"),
        ("functions_basics", "Term 2", "Modular Problem Solving"),
        ("what_is_ai", "Term 2", "Introduction to Artificial Intelligence"),
    ],
    9: [
        ("lists", "Term 1", "Lists, Indexing & Slicing"),
        ("ds_dicts", "Term 1", "Dictionaries & Key-Value Models"),
        ("functions_args", "Term 1", "Functions, Parameters & Return Values"),
        ("errors_handling", "Term 2", "Defensive Programming & Try/Except"),
        ("what_is_ai", "Term 2", "How AI Systems Learn from Data"),
    ],
    10: [
        ("ds_dicts", "Term 1", "Structured Data & Lookups"),
        ("comprehensions", "Term 1", "Expressive List Comprehensions"),
        ("fileio_reading", "Term 1", "Working with Files & Datasets"),
        ("llm_how_they_work", "Term 2", "How Large Language Models Work"),
        ("prompt_engineering_basics", "Term 2", "Structured Prompt Engineering"),
    ],
    11: [
        ("oop_classes", "Term 1", "Object-Oriented Design & Classes"),
        ("oop_inheritance", "Term 1", "Inheritance & Code Reuse"),
        ("recursion_fundamentals", "Term 2", "Recursive Thinking & Call Stacks"),
        ("big_o_complexity", "Term 2", "Algorithm Efficiency & Big-O"),
        ("embeddings_similarity", "Term 2", "Embeddings & Vector Similarity"),
    ],
    12: [
        ("oop_polymorphism", "Term 1", "Polymorphism & Clean Architecture"),
        ("trees_basics", "Term 1", "Trees & Hierarchical Structures"),
        ("graphs_basics", "Term 2", "Graphs & Shortest-Path Logic"),
        ("rag_fundamentals", "Term 2", "Retrieval-Augmented Generation"),
        ("ai_safety_ethics", "Term 2", "Responsible AI & Safety"),
    ],
}

# Rich non-coding school subject unit templates (instantiated per board & grade)
_NON_CODING_SUBJECT_CATALOG: list[dict[str, Any]] = [
    {
        "subject_code": "mathematics",
        "subject_name": "Mathematics",
        "pedagogy_mode": "concept_study",
        "order_index": 2,
        "estimated_hours": 32,
        "units": [
            (
                "Term 1",
                "Number Systems & Rational Reasoning",
                "Representing ratios, negative fractions, and number-line intuition in everyday budgets.",
                "If a submarine is at -3/4 km and rises by +1/2 km, why does the sign stay negative?",
                "Compare distances from zero on a vertical number line.",
                "Because |-3/4| > |1/2|, the submarine remains at -1/4 km below sea level.",
                [
                    ("Number Line Anchors", "Every rational number sits at a precise fraction of a step between whole integers.", "Range", "(-1 .. +1)"),
                    ("Sign Balance", "Adding opposite signs behaves like net elevation: subtract magnitudes and keep the dominant direction.", "Net Step", "-3/4 + 1/2 = -1/4"),
                ],
                {
                    "prompt": "A cold-storage vault starts at -4.5 C and warms by 1.75 C. What is its new temperature?",
                    "options": ["-6.25 C", "-2.75 C", "+2.75 C", "-3.25 C"],
                    "correct_index": 1,
                    "explanation": "Moving +1.75 toward zero from -4.5 leaves -2.75 C.",
                },
            ),
            (
                "Term 1",
                "Linear Equations in Real Scenarios",
                "Translating word problems about ages, fares, and mixtures into balanced single-variable equations.",
                "Why must whatever operation you apply to the left side of '=' also happen on the right?",
                "Think of '=' as a balanced weighing scale.",
                "Keeping both pans equal preserves the unknown's true value through every simplification step.",
                [
                    ("Balance Principle", "An equation is a seesaw in equilibrium; undo outer operations systematically.", "Invariant", "LHS == RHS"),
                    ("Translate Words First", "Define what 'x' represents in units before writing symbols.", "Clarity", "1 unknown -> 1 equation"),
                ],
                {
                    "prompt": "Three consecutive integers sum to 54. What is the smallest of the three integers?",
                    "options": ["16", "17", "18", "19"],
                    "correct_index": 1,
                    "explanation": "x + (x+1) + (x+2) = 54 -> 3x + 3 = 54 -> x = 17.",
                },
            ),
            (
                "Term 2",
                "Data Handling, Ratios & Probability",
                "Interpreting bar charts, compound ratios, and fair-chance experiments without calculation traps.",
                "If a fair six-sided die lands on 6 three times in a row, does 6 become less likely on throw 4?",
                "Does the die remember its past rolls?",
                "Each roll is independent; the probability remains 1/6 regardless of prior streaks.",
                [
                    ("Sample Space", "Count all equally likely outcomes first before measuring your target event.", "Fair Die", "6 outcomes"),
                    ("Independence", "Random physical dice have no memory across trials.", "Next Roll P(6)", "1 / 6"),
                ],
                {
                    "prompt": "A bag holds 3 red, 5 blue, and 2 green marbles. What is the probability of picking a blue marble?",
                    "options": ["1/5", "3/10", "1/2", "5/8"],
                    "correct_index": 2,
                    "explanation": "There are 5 blue marbles out of 10 total marbles (5/10 = 1/2).",
                },
            ),
        ],
    },
    {
        "subject_code": "physics",
        "subject_name": "Physics",
        "pedagogy_mode": "concept_study",
        "order_index": 3,
        "estimated_hours": 28,
        "units": [
            (
                "Term 1",
                "Force, Pressure & Area",
                "Understanding how the same push creates dramatically different pressure depending on contact area.",
                "Why do wide camel feet avoid sinking in desert sand while narrow heels sink deeply?",
                "Compare Pressure = Force / Area for two shoes carrying the same weight.",
                "Spreading the same body weight over a larger area lowers pressure (P = F/A).",
                [
                    ("Force vs Pressure", "Force is the total push (Newtons); pressure concentrates that push per square meter (Pascals).", "Formula", "P = F / A"),
                    ("Fluid Depth", "Liquid pressure grows with depth regardless of container shape.", "Driver", "rho * g * h"),
                ],
                {
                    "prompt": "A 600 N crate rests on a face of area 2 m^2. What pressure does it exert on the floor?",
                    "options": ["1200 Pa", "300 Pa", "600 Pa", "150 Pa"],
                    "correct_index": 1,
                    "explanation": "Pressure = Force / Area = 600 N / 2 m^2 = 300 Pa.",
                },
            ),
            (
                "Term 2",
                "Light, Reflection & Optics",
                "How plane and curved mirrors bend paths of light rays to form real and virtual images.",
                "When light slows down entering glass from air at an angle, which way does it bend?",
                "Imagine one wheel of a cart hitting mud before the other wheel.",
                "The ray bends toward the normal line because the side entering glass slows down first.",
                [
                    ("Law of Reflection", "Angle of incidence always equals angle of reflection relative to the surface normal.", "Mirror Rule", "theta_i = theta_r"),
                    ("Refraction", "Speed change across media shifts wavelength and bends oblique rays.", "Medium Shift", "v = c / n"),
                ],
                {
                    "prompt": "A light ray strikes a flat mirror at 35 degrees to the normal. What is the angle of reflection?",
                    "options": ["55 deg", "35 deg", "70 deg", "90 deg"],
                    "correct_index": 1,
                    "explanation": "By the law of reflection, angle of reflection equals angle of incidence (35 deg).",
                },
            ),
        ],
    },
    {
        "subject_code": "chemistry",
        "subject_name": "Chemistry",
        "pedagogy_mode": "concept_study",
        "order_index": 4,
        "estimated_hours": 26,
        "units": [
            (
                "Term 1",
                "Metals, Non-Metals & Reactivity",
                "Predicting corrosion, displacement reactions, and conductivity from valence electron behavior.",
                "Why can iron displace copper from blue copper sulphate solution while copper cannot displace iron?",
                "Compare how eagerly each metal gives up outer electrons.",
                "Iron is higher in the reactivity series, so it oxidizes readily and reduces Cu2+ ions to solid copper.",
                [
                    ("Reactivity Series", "More reactive metals win competition for anions in aqueous salts.", "Displacement", "Fe + CuSO4 -> FeSO4 + Cu"),
                    ("Rust Prevention", "Galvanizing coats iron with more reactive zinc plus a physical moisture barrier.", "Sacrificial Shield", "Zn > Fe"),
                ],
                {
                    "prompt": "Which property lets copper be drawn into thin electrical wires?",
                    "options": ["Sonority", "Ductility", "Brittleness", "Sublimation"],
                    "correct_index": 1,
                    "explanation": "Ductility is the ability of a metal to be stretched into thin wires without breaking.",
                },
            ),
            (
                "Term 2",
                "Combustion, Ignition & Flame Zones",
                "Breaking down the fire triangle, fuel efficiency, and why the outermost flame zone burns hottest.",
                "Why does a yellow candle flame deposit soot while a blue gas stove flame burns cleanly?",
                "Check how much oxygen mixes with the fuel before burning.",
                "Blue flames achieve complete combustion with ample oxygen; yellow flames burn partially and leave glowing carbon.",
                [
                    ("Fire Triangle", "Combustion requires fuel, oxidizer (O2), and temperature above ignition point.", "Break 1 Side", "Fire stops"),
                    ("Calorific Value", "Energy released per kilogram determines fuel efficiency in transport & kitchens.", "Metric", "kJ / kg"),
                ],
                {
                    "prompt": "Removing which of the three requirements extinguishes an oil fire without spreading burning droplets?",
                    "options": ["Pouring cold water", "Cutting oxygen supply with a tight lid/CO2", "Fanning air", "Adding more fuel"],
                    "correct_index": 1,
                    "explanation": "Smothering cuts oxygen; water sinks beneath burning oil and flashes to steam, scattering flames.",
                },
            ),
        ],
    },
    {
        "subject_code": "biology",
        "subject_name": "Biology",
        "pedagogy_mode": "concept_study",
        "order_index": 5,
        "estimated_hours": 24,
        "units": [
            (
                "Term 1",
                "Cell Structure & Organelles",
                "Comparing plant and animal cells by treating organelles as specialized departments in a city.",
                "Why do plant cells need a rigid cellulose cell wall around their flexible plasma membrane?",
                "Plants lack skeletons — how do stems stay upright against gravity and water pressure?",
                "The cell wall withstands internal turgor pressure from the large vacuole so cells do not burst.",
                [
                    ("Selectively Permeable Membrane", "Controls nutrient intake and waste exit in every living cell.", "Boundary", "Phospholipid bilayer"),
                    ("Mitochondria vs Chloroplasts", "Chloroplasts capture solar energy into sugars; mitochondria unlock ATP energy from sugars.", "Energy Pair", "Capture -> Spend"),
                ],
                {
                    "prompt": "Which organelle gives plant leaves their green pigment and builds glucose from sunlight?",
                    "options": ["Ribosome", "Golgi apparatus", "Chloroplast", "Lysosome"],
                    "correct_index": 2,
                    "explanation": "Chloroplasts contain chlorophyll and carry out photosynthesis in plant cells.",
                },
            ),
            (
                "Term 2",
                "Microorganisms, Immunity & Nitrogen Cycle",
                "How helpful bacteria enrich soil and ferment food while vaccines train memory cells safely.",
                "How does a vaccine protect you before you ever meet the live pathogen?",
                "Think of training security guards using a harmless wanted poster.",
                "Weakened or dead antigens prompt immune cells to build memory antibodies ready for fast response.",
                [
                    ("Friends vs Pathogens", "Lactobacillus & Rhizobium support digestion and soil nitrates; strict hygiene blocks disease vectors.", "Nitrogen Fixation", "N2 -> NH3"),
                    ("Memory Immunity", "Primed B & T cells respond orders of magnitude faster on second exposure.", "Defense", "Antibody surge"),
                ],
                {
                    "prompt": "Which root-nodule bacterium converts atmospheric nitrogen into plant-usable compounds in legumes?",
                    "options": ["Rhizobium", "Yeast", "Amoeba", "Penicillium"],
                    "correct_index": 0,
                    "explanation": "Rhizobium lives symbiotically in legume root nodules and fixes atmospheric nitrogen.",
                },
            ),
        ],
    },
    {
        "subject_code": "social_studies",
        "subject_name": "Social Studies",
        "pedagogy_mode": "concept_study",
        "order_index": 6,
        "estimated_hours": 22,
        "units": [
            (
                "Term 1",
                "Constitutional Democracy & Fundamental Rights",
                "Why separation of powers prevents concentration of authority and protects everyday citizens.",
                "Why is an independent judiciary essential even when Parliament is democratically elected?",
                "Who checks whether a newly passed law violates citizens' fundamental rights?",
                "Courts act as constitutional referees, keeping executive and legislative power within constitutional limits.",
                [
                    ("Three Organs", "Legislature writes laws, Executive enforces them, Judiciary interprets constitutional validity.", "Checks & Balances", "3 branches"),
                    ("Fundamental Rights", "Enforceable guarantees covering equality, expression, and constitutional remedies.", "Safeguard", "Rule of law"),
                ],
                {
                    "prompt": "Which principle ensures no single branch of government can make, enforce, and judge laws alone?",
                    "options": ["Mercantilism", "Separation of powers", "Feudalism", "Unitary monopoly"],
                    "correct_index": 1,
                    "explanation": "Separation of powers divides authority across legislature, executive, and judiciary.",
                },
            ),
            (
                "Term 2",
                "Sustainable Resources & Economic Geography",
                "Evaluating renewable vs non-renewable resource stewardship across agriculture and industry.",
                "Why can drip irrigation raise crop yields while cutting groundwater depletion?",
                "Compare flooding an entire field vs delivering water drop-by-drop at root zones.",
                "Delivering water directly to roots slashes evaporation and runoff while keeping soil aerated.",
                [
                    ("Resource Stock vs Flow", "Renewable resources replenish only if extraction stays slower than natural recovery.", "Threshold", "Use <= Regen"),
                    ("Watershed Care", "Contour farming and rainwater harvesting recharge aquifers locally.", "Impact", "Higher water table"),
                ],
                {
                    "prompt": "Which farming practice conserves soil moisture on hillsides by following natural elevation lines?",
                    "options": ["Contour ploughing", "Clear-cutting", "Over-grazing", "Open-pit quarrying"],
                    "correct_index": 0,
                    "explanation": "Contour ploughing creates ridges perpendicular to slopes, slowing runoff and soil erosion.",
                },
            ),
        ],
    },
]


def _get_db_path(db_path: str | None = None) -> str:
    return db_path or os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def ensure_school_schema(db_path: str | None = None) -> None:
    """Create multi-tenant school onboarding & grade-wise syllabus tables idempotently."""
    target = _get_db_path(db_path)
    conn = sqlite3.connect(target, timeout=10.0)
    try:
        conn.execute("PRAGMA busy_timeout = 10000")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS school_tenants (
                org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
                board TEXT NOT NULL DEFAULT 'CBSE',
                academic_year TEXT NOT NULL DEFAULT '2026-27',
                sso_provider TEXT DEFAULT '',
                sso_domain TEXT DEFAULT '',
                sso_config_json TEXT DEFAULT '{}',
                hide_public_tracks INTEGER NOT NULL DEFAULT 1,
                seat_limit INTEGER NOT NULL DEFAULT 250,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS syllabus_templates (
                id TEXT PRIMARY KEY,
                board TEXT NOT NULL,
                grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
                title TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT '1.0',
                description TEXT DEFAULT '',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(board, grade, version)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS grade_subjects (
                id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL REFERENCES syllabus_templates(id) ON DELETE CASCADE,
                subject_code TEXT NOT NULL,
                subject_name TEXT NOT NULL,
                pedagogy_mode TEXT NOT NULL CHECK (pedagogy_mode IN ('coding_ide', 'concept_study')),
                term TEXT NOT NULL DEFAULT 'Term 1',
                order_index INTEGER NOT NULL DEFAULT 0,
                estimated_hours INTEGER NOT NULL DEFAULT 20,
                UNIQUE(template_id, subject_code)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS syllabus_module_map (
                id TEXT PRIMARY KEY,
                grade_subject_id TEXT NOT NULL REFERENCES grade_subjects(id) ON DELETE CASCADE,
                term TEXT NOT NULL DEFAULT 'Term 1',
                unit_order INTEGER NOT NULL,
                unit_title TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                pedagogy_mode TEXT NOT NULL CHECK (pedagogy_mode IN ('coding_ide', 'concept_study')),
                is_required INTEGER NOT NULL DEFAULT 1,
                UNIQUE(grade_subject_id, lesson_id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_smm_subject ON syllabus_module_map(grade_subject_id, unit_order)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cohort_enrollments (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                cohort_name TEXT NOT NULL,
                grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
                board TEXT NOT NULL,
                template_id TEXT NOT NULL REFERENCES syllabus_templates(id),
                selected_subjects_json TEXT NOT NULL,
                provisioned_by TEXT NOT NULL REFERENCES users(id),
                hide_public_tracks INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(org_id, cohort_name)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cohort_org ON cohort_enrollments(org_id, grade)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cohort_teacher_assignments (
                org_id TEXT NOT NULL,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                cohort_name TEXT NOT NULL,
                subject_code TEXT DEFAULT '',
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (org_id, user_id, cohort_name, subject_code)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS school_concept_lessons (
                lesson_id TEXT PRIMARY KEY,
                board TEXT NOT NULL,
                grade INTEGER NOT NULL,
                subject_code TEXT NOT NULL,
                subject_name TEXT NOT NULL,
                term TEXT NOT NULL,
                unit_order INTEGER NOT NULL,
                unit_title TEXT NOT NULL,
                pedagogy_mode TEXT NOT NULL DEFAULT 'concept_study',
                lesson_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _build_concept_lesson_payload(
    *,
    lesson_id: str,
    board: str,
    grade: int,
    subject_code: str,
    subject_name: str,
    term: str,
    unit_order: int,
    unit_title: str,
    summary: str,
    socratic_q: str,
    socratic_hint: str,
    socratic_reveal: str,
    scrolly_pairs: list[tuple[str, str, str, str]],
    quiz_item: dict[str, Any],
) -> dict[str, Any]:
    story_md = (
        f"## {unit_title} ({board} Grade {grade} · {subject_name})\n\n"
        f"{summary}\n\n"
        f"### Core Insight\n"
        f"{socratic_reveal}\n"
    )
    scrolly_steps = [
        {
            "title": step_title,
            "body": step_body,
            "visual_label": metric_label,
            "visual_metric": metric_val,
        }
        for step_title, step_body, metric_label, metric_val in scrolly_pairs
    ]
    return {
        "id": lesson_id,
        "topic": unit_title,
        "track": f"school_{subject_code}",
        "module": term.lower().replace(" ", "_"),
        "order": unit_order,
        "pedagogy_mode": "concept_study",
        "subject_code": subject_code,
        "subject_name": subject_name,
        "grade": grade,
        "board": board,
        "term": term,
        "title": {"en": unit_title},
        "description": {"en": summary},
        "xp_reward": 50,
        "story_variants": {"en": story_md},
        "socratic_cards": [
            {
                "id": f"{lesson_id}_card_1",
                "question": socratic_q,
                "hint": socratic_hint,
                "reveal": socratic_reveal,
                "takeaway": summary,
            }
        ],
        "scrolly_steps": scrolly_steps,
        "concept_checks": [
            {
                "id": f"{lesson_id}_check_1",
                "type": "mcq",
                "prompt": quiz_item["prompt"],
                "options": quiz_item["options"],
                "correct_index": quiz_item["correct_index"],
                "explanation": quiz_item["explanation"],
            }
        ],
        "teach_back_prompt": (
            f"Explain '{unit_title}' in 2–3 everyday sentences as if teaching a classmate, "
            "with one real-world example."
        ),
        "animation_sequence": [],
        "practice_challenges": [],
        "generated": False,
        "school_seeded": True,
    }


def _build_cs_term_qb_lesson_payload(
    *,
    lesson_id: str,
    board: str,
    board_name: str,
    grade: int,
    subject_code: str,
    subject_name: str,
    official_course_code: str,
    exam_pattern: dict[str, Any],
    term: str,
    unit_order: int,
    term_units: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a board-authentic Term Question Bank & Viva Prep concept_study lesson."""
    unit_title = f"{term} Question Bank & Viva Prep ({official_course_code})"
    covered_titles = [u.get("unit_title", "") for u in term_units if u.get("unit_title")]
    summary = (
        f"2026–27 {board_name} Class {grade} {term} Question Bank covering: "
        + "; ".join(covered_titles)
        + "."
    )
    sections_str = " · ".join(exam_pattern.get("sections") or [])
    story_md = (
        f"## {unit_title}\n\n"
        f"{summary}\n\n"
        + (f"### Official Blueprint\n{sections_str}\n" if sections_str else "")
    )

    socratic_cards: list[dict[str, Any]] = []
    scrolly_steps: list[dict[str, Any]] = []
    concept_checks: list[dict[str, Any]] = []
    short_answers: list[dict[str, Any]] = []
    coding_labs: list[dict[str, Any]] = []

    for idx, unit in enumerate(term_units, start=1):
        utitle = unit.get("unit_title", f"Unit {idx}")
        sc = unit.get("socratic_card") or {}
        if sc.get("question"):
            socratic_cards.append(
                {
                    "id": f"{lesson_id}_card_{idx}",
                    "unit_title": utitle,
                    "question": f"[{utitle}] {sc['question']}",
                    "hint": sc.get("hint", ""),
                    "reveal": sc.get("reveal", ""),
                    "takeaway": unit.get("summary", ""),
                }
            )
        for step in unit.get("scrolly_steps") or []:
            scrolly_steps.append(
                {
                    "title": f"{utitle} — {step.get('title', 'Concept')}",
                    "body": step.get("body", ""),
                    "visual_label": step.get("visual_label", "Key Metric"),
                    "visual_metric": step.get("visual_metric", ""),
                }
            )
        qb = unit.get("question_bank") or {}
        for q_idx, mcq in enumerate(qb.get("mcqs") or [], start=1):
            concept_checks.append(
                {
                    "id": mcq.get("id") or f"{lesson_id}_u{idx}_q{q_idx}",
                    "type": "mcq",
                    "unit_title": utitle,
                    "prompt": mcq.get("prompt", ""),
                    "options": mcq.get("options", []),
                    "correct_index": int(mcq.get("correct_index", 0)),
                    "difficulty": mcq.get("difficulty", "easy"),
                    "bloom_level": mcq.get("bloom_level", "understand"),
                    "marks": int(mcq.get("marks", 1)),
                    "explanation": mcq.get("explanation", ""),
                }
            )
        for sa_idx, sa in enumerate(qb.get("short_answers") or [], start=1):
            short_answers.append(
                {
                    "id": sa.get("id") or f"{lesson_id}_u{idx}_sa{sa_idx}",
                    "unit_title": utitle,
                    "marks": int(sa.get("marks", 2)),
                    "question": sa.get("question", ""),
                    "model_answer": sa.get("model_answer", ""),
                }
            )
        lab = qb.get("coding_lab")
        if isinstance(lab, dict) and lab.get("instruction"):
            coding_labs.append(
                {
                    "id": f"{lesson_id}_u{idx}_lab",
                    "unit_title": utitle,
                    "instruction": lab.get("instruction", ""),
                    "starter_code": lab.get("starter_code", ""),
                    "solution_code": lab.get("solution_code", ""),
                    "expected_output": lab.get("expected_output", ""),
                }
            )

    return {
        "id": lesson_id,
        "topic": unit_title,
        "track": f"school_{subject_code}",
        "module": term.lower().replace(" ", "_"),
        "order": unit_order,
        "pedagogy_mode": "concept_study",
        "subject_code": subject_code,
        "subject_name": subject_name,
        "official_course_code": official_course_code,
        "exam_pattern": exam_pattern,
        "grade": grade,
        "board": board,
        "board_name": board_name,
        "academic_year": "2026-27",
        "term": term,
        "title": {"en": unit_title},
        "description": {"en": summary},
        "xp_reward": 75,
        "story_variants": {"en": story_md},
        "socratic_cards": socratic_cards,
        "scrolly_steps": scrolly_steps,
        "concept_checks": concept_checks,
        "short_answers": short_answers,
        "coding_labs": coding_labs,
        "teach_back_prompt": (
            f"Pick one core concept from {board} Class {grade} {term} Computer Science "
            f"({', '.join(covered_titles[:2])}) and explain how it works in 2–3 clear sentences "
            "with one concrete example, just as in a board practical viva."
        ),
        "animation_sequence": [],
        "practice_challenges": [],
        "generated": False,
        "school_seeded": True,
        "is_question_bank": True,
    }


def _build_catalog_subject_unit_payload(
    *,
    lesson_id: str,
    board: str,
    grade: int,
    subject_code: str,
    subject_name: str,
    unit: dict[str, Any],
) -> dict[str, Any]:
    """Build a concept_study unit payload from an extensible JSON catalog subject unit."""
    unit_title = unit.get("unit_title", "Curriculum Unit")
    term = unit.get("term", "Term 1")
    unit_order = int(unit.get("unit_order", 1))
    summary = unit.get("summary", "")
    sc = unit.get("socratic_card") or {}
    qb = unit.get("question_bank") or {}
    mcqs = [
        {
            "id": m.get("id") or f"{lesson_id}_check_{i}",
            "type": "mcq",
            "unit_title": unit_title,
            "prompt": m.get("prompt", ""),
            "options": m.get("options", []),
            "correct_index": int(m.get("correct_index", 0)),
            "difficulty": m.get("difficulty", "easy"),
            "bloom_level": m.get("bloom_level", "understand"),
            "marks": int(m.get("marks", 1)),
            "explanation": m.get("explanation", ""),
        }
        for i, m in enumerate(qb.get("mcqs") or [], start=1)
    ]
    short_answers = [
        {
            "id": sa.get("id") or f"{lesson_id}_sa_{i}",
            "unit_title": unit_title,
            "marks": int(sa.get("marks", 2)),
            "question": sa.get("question", ""),
            "model_answer": sa.get("model_answer", ""),
        }
        for i, sa in enumerate(qb.get("short_answers") or [], start=1)
    ]
    labs = []
    if isinstance(qb.get("coding_lab"), dict) and qb["coding_lab"].get("instruction"):
        labs.append({"id": f"{lesson_id}_lab", "unit_title": unit_title, **qb["coding_lab"]})

    return {
        "id": lesson_id,
        "topic": unit_title,
        "track": f"school_{subject_code}",
        "module": term.lower().replace(" ", "_"),
        "order": unit_order,
        "pedagogy_mode": "concept_study",
        "subject_code": subject_code,
        "subject_name": subject_name,
        "grade": grade,
        "board": board,
        "term": term,
        "title": {"en": unit_title},
        "description": {"en": summary},
        "xp_reward": 50,
        "story_variants": {"en": f"## {unit_title} ({board} Grade {grade} · {subject_name})\n\n{summary}\n"},
        "socratic_cards": (
            [
                {
                    "id": f"{lesson_id}_card_1",
                    "question": sc.get("question", ""),
                    "hint": sc.get("hint", ""),
                    "reveal": sc.get("reveal", ""),
                    "takeaway": summary,
                }
            ]
            if sc.get("question")
            else []
        ),
        "scrolly_steps": unit.get("scrolly_steps") or [],
        "concept_checks": mcqs,
        "short_answers": short_answers,
        "coding_labs": labs,
        "teach_back_prompt": (
            f"Explain '{unit_title}' in 2–3 everyday sentences as if teaching a classmate, "
            "with one real-world example."
        ),
        "animation_sequence": [],
        "practice_challenges": [],
        "generated": False,
        "school_seeded": True,
    }


def seed_school_syllabi(db_path: str | None = None) -> None:
    """Populate STATE, MATRIC, CBSE, ICSE, and IB templates for Grades 6–12 idempotently."""
    target = _get_db_path(db_path)
    ensure_school_schema(target)
    catalog = _load_cs_syllabus_catalog()
    boards_catalog = catalog.get("boards") or {}

    conn = sqlite3.connect(target, timeout=10.0)
    try:
        conn.execute("PRAGMA busy_timeout = 10000")
        for board in BOARDS:
            board_slug = board.lower()
            board_entry = boards_catalog.get(board) or {}
            board_name = board_entry.get("board_name") or board
            framework_desc = board_entry.get("curriculum_framework") or ""

            for grade in GRADES:
                template_id = f"{board_slug}_g{grade:02d}_v1"
                grade_subjects_cat = ((board_entry.get("grades") or {}).get(str(grade)) or {}).get("subjects") or {}
                cs_cat = grade_subjects_cat.get("computer_science")

                tpl_desc = (
                    f"2026–27 {board_name} curriculum ({framework_desc}) for Grade {grade}, combining Computer Science & Question Bank with STEM and Humanities."
                    if framework_desc
                    else f"Standardized {board} curriculum for Grade {grade} combining Computer Science & AI with core STEM and Humanities."
                )
                conn.execute(
                    """
                    INSERT INTO syllabus_templates
                        (id, board, grade, title, version, description, is_active)
                    VALUES (?, ?, ?, ?, '1.0', ?, 1)
                    ON CONFLICT(board, grade, version) DO UPDATE SET
                        title = excluded.title,
                        description = excluded.description,
                        is_active = 1
                    """,
                    [
                        template_id,
                        board,
                        grade,
                        f"{board} Grade {grade} Integrated Syllabus (2026-27)" if cs_cat else f"{board} Grade {grade} Integrated Syllabus",
                        tpl_desc,
                    ],
                )

                # 1. Computer Science & AI (2026-27 4-board researched catalog when present; fallback for IB)
                cs_sub_id = f"{template_id}_cs_ai"
                if cs_cat and cs_cat.get("units"):
                    cat_units = cs_cat["units"]
                    est_hours = int(cs_cat.get("estimated_hours") or len(cat_units) * 6)
                    conn.execute(
                        """
                        INSERT INTO grade_subjects
                            (id, template_id, subject_code, subject_name, pedagogy_mode, term, order_index, estimated_hours)
                        VALUES (?, ?, 'cs_ai', 'Computer Science & AI', 'coding_ide', 'Full Year', 1, ?)
                        ON CONFLICT(template_id, subject_code) DO UPDATE SET
                            estimated_hours = excluded.estimated_hours
                        """,
                        [cs_sub_id, template_id, est_hours],
                    )
                    # Remove stale module mappings if upgrading from legacy generic tuples
                    conn.execute("DELETE FROM syllabus_module_map WHERE grade_subject_id = ?", [cs_sub_id])

                    for u in cat_units:
                        u_order = int(u.get("unit_order") or 1)
                        u_term = u.get("term") or "Term 1"
                        u_title = u.get("unit_title") or f"Unit {u_order}"
                        u_lid = u.get("mapped_pymasters_lesson_id") or "variables_intro"
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO syllabus_module_map
                                (id, grade_subject_id, term, unit_order, unit_title, lesson_id, pedagogy_mode, is_required)
                            VALUES (?, ?, ?, ?, ?, ?, 'coding_ide', 1)
                            """,
                            [
                                f"{cs_sub_id}_u{u_order}",
                                cs_sub_id,
                                u_term,
                                u_order,
                                u_title,
                                u_lid,
                            ],
                        )

                    # Seed Term 1 & Term 2 Question Bank & Viva Prep units (concept_study)
                    official_code = cs_cat.get("official_course_code") or f"{board}-CS-{grade:02d}"
                    exam_pattern = cs_cat.get("exam_pattern") or {}
                    for t_idx, term_label in enumerate(("Term 1", "Term 2"), start=1):
                        t_units = [u for u in cat_units if (u.get("term") or "Term 1") == term_label]
                        if not t_units:
                            continue
                        qb_order = len(cat_units) + t_idx
                        qb_lesson_id = f"school_{board_slug}_g{grade:02d}_cs_qb_t{t_idx}"
                        qb_payload = _build_cs_term_qb_lesson_payload(
                            lesson_id=qb_lesson_id,
                            board=board,
                            board_name=board_name,
                            grade=grade,
                            subject_code="cs_ai",
                            subject_name="Computer Science & AI",
                            official_course_code=official_code,
                            exam_pattern=exam_pattern,
                            term=term_label,
                            unit_order=qb_order,
                            term_units=t_units,
                        )
                        conn.execute(
                            """
                            INSERT INTO school_concept_lessons
                                (lesson_id, board, grade, subject_code, subject_name, term, unit_order, unit_title, pedagogy_mode, lesson_data)
                            VALUES (?, ?, ?, 'cs_ai', 'Computer Science & AI', ?, ?, ?, 'concept_study', ?)
                            ON CONFLICT(lesson_id) DO UPDATE SET
                                term = excluded.term,
                                unit_order = excluded.unit_order,
                                unit_title = excluded.unit_title,
                                lesson_data = excluded.lesson_data
                            """,
                            [
                                qb_lesson_id,
                                board,
                                grade,
                                term_label,
                                qb_order,
                                qb_payload["title"]["en"],
                                json.dumps(qb_payload),
                            ],
                        )
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO syllabus_module_map
                                (id, grade_subject_id, term, unit_order, unit_title, lesson_id, pedagogy_mode, is_required)
                            VALUES (?, ?, ?, ?, ?, ?, 'concept_study', 1)
                            """,
                            [
                                f"{cs_sub_id}_qb_t{t_idx}",
                                cs_sub_id,
                                term_label,
                                qb_order,
                                qb_payload["title"]["en"],
                                qb_lesson_id,
                            ],
                        )
                else:
                    cs_units = _CS_LESSONS_BY_GRADE[grade]
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO grade_subjects
                            (id, template_id, subject_code, subject_name, pedagogy_mode, term, order_index, estimated_hours)
                        VALUES (?, ?, 'cs_ai', 'Computer Science & AI', 'coding_ide', 'Full Year', 1, ?)
                        """,
                        [cs_sub_id, template_id, len(cs_units) * 5],
                    )
                    for idx, (lesson_id, term, unit_title) in enumerate(cs_units, start=1):
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO syllabus_module_map
                                (id, grade_subject_id, term, unit_order, unit_title, lesson_id, pedagogy_mode, is_required)
                            VALUES (?, ?, ?, ?, ?, ?, 'coding_ide', 1)
                            """,
                            [
                                f"{cs_sub_id}_u{idx}",
                                cs_sub_id,
                                term,
                                idx,
                                unit_title,
                                lesson_id,
                            ],
                        )

                # 2. Concept Study subjects: Math, Physics, Chemistry, Biology, Social Studies
                #    Supports board-specific JSON catalog overrides automatically when present!
                for subj in _NON_CODING_SUBJECT_CATALOG:
                    scode = subj["subject_code"]
                    sub_id = f"{template_id}_{scode}"
                    cat_subj = grade_subjects_cat.get(scode)
                    est_hrs = int((cat_subj or {}).get("estimated_hours") or subj["estimated_hours"])
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO grade_subjects
                            (id, template_id, subject_code, subject_name, pedagogy_mode, term, order_index, estimated_hours)
                        VALUES (?, ?, ?, ?, ?, 'Full Year', ?, ?)
                        """,
                        [
                            sub_id,
                            template_id,
                            scode,
                            subj["subject_name"],
                            subj["pedagogy_mode"],
                            subj["order_index"],
                            est_hrs,
                        ],
                    )
                    if cat_subj and cat_subj.get("units"):
                        conn.execute("DELETE FROM syllabus_module_map WHERE grade_subject_id = ?", [sub_id])
                        for u in cat_subj["units"]:
                            idx = int(u.get("unit_order") or 1)
                            term = u.get("term") or "Term 1"
                            unit_title = u.get("unit_title") or f"Unit {idx}"
                            lesson_id = f"school_{board_slug}_g{grade:02d}_{scode}_u{idx}"
                            payload = _build_catalog_subject_unit_payload(
                                lesson_id=lesson_id,
                                board=board,
                                grade=grade,
                                subject_code=scode,
                                subject_name=subj["subject_name"],
                                unit=u,
                            )
                            conn.execute(
                                """
                                INSERT INTO school_concept_lessons
                                    (lesson_id, board, grade, subject_code, subject_name, term, unit_order, unit_title, pedagogy_mode, lesson_data)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'concept_study', ?)
                                ON CONFLICT(lesson_id) DO UPDATE SET lesson_data = excluded.lesson_data
                                """,
                                [lesson_id, board, grade, scode, subj["subject_name"], term, idx, unit_title, json.dumps(payload)],
                            )
                            conn.execute(
                                """
                                INSERT OR IGNORE INTO syllabus_module_map
                                    (id, grade_subject_id, term, unit_order, unit_title, lesson_id, pedagogy_mode, is_required)
                                VALUES (?, ?, ?, ?, ?, ?, 'concept_study', 1)
                                """,
                                [f"{sub_id}_u{idx}", sub_id, term, idx, unit_title, lesson_id],
                            )
                    else:
                        for idx, unit_tuple in enumerate(subj["units"], start=1):
                            (
                                term,
                                unit_title,
                                summary,
                                socratic_q,
                                socratic_hint,
                                socratic_reveal,
                                scrolly_pairs,
                                quiz_item,
                            ) = unit_tuple
                            lesson_id = f"school_{board_slug}_g{grade:02d}_{scode}_u{idx}"
                            payload = _build_concept_lesson_payload(
                                lesson_id=lesson_id,
                                board=board,
                                grade=grade,
                                subject_code=scode,
                                subject_name=subj["subject_name"],
                                term=term,
                                unit_order=idx,
                                unit_title=unit_title,
                                summary=summary,
                                socratic_q=socratic_q,
                                socratic_hint=socratic_hint,
                                socratic_reveal=socratic_reveal,
                                scrolly_pairs=scrolly_pairs,
                                quiz_item=quiz_item,
                            )
                            conn.execute(
                                """
                                INSERT OR IGNORE INTO school_concept_lessons
                                    (lesson_id, board, grade, subject_code, subject_name, term, unit_order, unit_title, pedagogy_mode, lesson_data)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'concept_study', ?)
                                """,
                                [
                                    lesson_id,
                                    board,
                                    grade,
                                    scode,
                                    subj["subject_name"],
                                    term,
                                    idx,
                                    unit_title,
                                    json.dumps(payload),
                                ],
                            )
                            conn.execute(
                                """
                                INSERT OR IGNORE INTO syllabus_module_map
                                    (id, grade_subject_id, term, unit_order, unit_title, lesson_id, pedagogy_mode, is_required)
                                VALUES (?, ?, ?, ?, ?, ?, 'concept_study', 1)
                                """,
                                [
                                    f"{sub_id}_u{idx}",
                                    sub_id,
                                    term,
                                    idx,
                                    unit_title,
                                    lesson_id,
                                ],
                            )

        conn.commit()
    finally:
        conn.close()


def get_question_bank(
    db_path: str | None,
    board: str,
    grade: int,
    subject_code: str = "cs_ai",
    term: str | None = None,
) -> dict[str, Any]:
    """Return structured Question Bank (MCQs, Short Answers, Coding Labs) for any Board x Grade x Subject."""
    norm_board = normalize_board(board)
    raw_subj = (subject_code or "cs_ai").strip().lower()
    norm_code = _SUBJECT_KEY_TO_CODE.get(raw_subj, raw_subj)
    cat_key = _CODE_TO_SUBJECT_KEY.get(norm_code, norm_code)
    term_filter = (term or "").strip()

    catalog = _load_cs_syllabus_catalog()
    board_entry = (catalog.get("boards") or {}).get(norm_board) or {}
    cat_subj = (((board_entry.get("grades") or {}).get(str(grade)) or {}).get("subjects") or {}).get(cat_key)

    if cat_subj and cat_subj.get("units"):
        mcqs: list[dict[str, Any]] = []
        short_answers: list[dict[str, Any]] = []
        coding_labs: list[dict[str, Any]] = []
        units_summary: list[dict[str, Any]] = []

        for u in cat_subj["units"]:
            u_term = u.get("term") or "Term 1"
            if term_filter and u_term.lower() != term_filter.lower():
                continue
            utitle = u.get("unit_title") or ""
            uorder = int(u.get("unit_order") or 1)
            qb = u.get("question_bank") or {}
            units_summary.append(
                {
                    "unit_order": uorder,
                    "term": u_term,
                    "unit_title": utitle,
                    "topics": u.get("topics") or [],
                    "mapped_lesson_id": u.get("mapped_pymasters_lesson_id") or "",
                }
            )
            for m in qb.get("mcqs") or []:
                mcqs.append({**m, "term": u_term, "unit_order": uorder, "unit_title": utitle})
            for sa in qb.get("short_answers") or []:
                short_answers.append({**sa, "term": u_term, "unit_order": uorder, "unit_title": utitle})
            lab = qb.get("coding_lab")
            if isinstance(lab, dict) and lab.get("instruction"):
                coding_labs.append({**lab, "term": u_term, "unit_order": uorder, "unit_title": utitle})

        return {
            "academic_year": catalog.get("academic_year", "2026-27"),
            "board": norm_board,
            "board_name": board_entry.get("board_name", norm_board),
            "grade": grade,
            "subject_code": norm_code,
            "subject_name": cat_subj.get("subject_name", "Computer Science & AI"),
            "official_course_code": cat_subj.get("official_course_code", ""),
            "exam_pattern": cat_subj.get("exam_pattern") or {},
            "extensible_subjects": catalog.get("extensible_subject_registry") or list(_SUBJECT_KEY_TO_CODE.values()),
            "units": units_summary,
            "mcqs": mcqs,
            "short_answers": short_answers,
            "coding_labs": coding_labs,
            "counts": {
                "units": len(units_summary),
                "mcqs": len(mcqs),
                "short_answers": len(short_answers),
                "coding_labs": len(coding_labs),
                "total_items": len(mcqs) + len(short_answers) + len(coding_labs),
            },
        }

    # Fallback: read seeded school_concept_lessons for non-CS subjects or IB
    target = _get_db_path(db_path)
    seed_school_syllabi(target)
    conn = sqlite3.connect(target, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        sql = "SELECT * FROM school_concept_lessons WHERE board = ? AND grade = ? AND subject_code = ?"
        params: list[Any] = [norm_board, grade, norm_code]
        if term_filter:
            sql += " AND lower(term) = lower(?)"
            params.append(term_filter)
        sql += " ORDER BY unit_order ASC"
        rows = conn.execute(sql, params).fetchall()
        mcqs = []
        short_answers = []
        coding_labs = []
        units_summary = []
        subj_name = norm_code.replace("_", " ").title()
        for r in rows:
            subj_name = r["subject_name"] or subj_name
            ldata = json.loads(r["lesson_data"])
            units_summary.append(
                {
                    "unit_order": r["unit_order"],
                    "term": r["term"],
                    "unit_title": r["unit_title"],
                    "topics": [r["unit_title"]],
                    "mapped_lesson_id": r["lesson_id"],
                }
            )
            for chk in ldata.get("concept_checks") or []:
                mcqs.append({**chk, "term": r["term"], "unit_order": r["unit_order"], "unit_title": r["unit_title"]})
            for sa in ldata.get("short_answers") or []:
                short_answers.append({**sa, "term": r["term"], "unit_order": r["unit_order"], "unit_title": r["unit_title"]})
            for lab in ldata.get("coding_labs") or []:
                coding_labs.append({**lab, "term": r["term"], "unit_order": r["unit_order"], "unit_title": r["unit_title"]})

        return {
            "academic_year": "2026-27",
            "board": norm_board,
            "board_name": norm_board,
            "grade": grade,
            "subject_code": norm_code,
            "subject_name": subj_name,
            "official_course_code": f"{norm_board}-{norm_code.upper()}-{grade:02d}",
            "exam_pattern": {},
            "extensible_subjects": ["cs_ai", "mathematics", "physics", "chemistry", "biology", "social_studies"],
            "units": units_summary,
            "mcqs": mcqs,
            "short_answers": short_answers,
            "coding_labs": coding_labs,
            "counts": {
                "units": len(units_summary),
                "mcqs": len(mcqs),
                "short_answers": len(short_answers),
                "coding_labs": len(coding_labs),
                "total_items": len(mcqs) + len(short_answers) + len(coding_labs),
            },
        }
    finally:
        conn.close()


def get_school_lesson(db_path: str, lesson_id: str) -> dict[str, Any] | None:
    """Load a seeded school concept lesson by ID if present."""
    if not lesson_id:
        return None
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        has_tbl = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='school_concept_lessons'"
        ).fetchone()
        if not has_tbl:
            return None
        row = conn.execute(
            "SELECT lesson_data FROM school_concept_lessons WHERE lesson_id = ?",
            [lesson_id],
        ).fetchone()
        if not row:
            return None
        return json.loads(row["lesson_data"])
    finally:
        conn.close()


def get_user_school_scope(db_path: str, user_id: str | None) -> dict[str, Any] | None:
    """Resolve active cohort syllabus scoping for a school student, if any.

    Returns None if the user is not in a provisioned cohort with active enrollments.
    """
    if not user_id:
        return None
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        has_tbl = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='cohort_enrollments'"
        ).fetchone()
        if not has_tbl:
            return None

        # Match cohorts explicitly mapped via org_member_groups, OR org-wide cohorts
        # when the member is a regular student ('member') in that school org.
        row = conn.execute(
            """
            SELECT ce.org_id, o.name AS org_name, ce.cohort_name, ce.grade, ce.board,
                   ce.template_id, ce.selected_subjects_json, ce.hide_public_tracks,
                   om.role AS member_role
            FROM org_members om
            JOIN organizations o ON o.id = om.org_id
            JOIN cohort_enrollments ce ON ce.org_id = om.org_id AND ce.status = 'active'
            LEFT JOIN org_member_groups omg
              ON omg.org_id = om.org_id AND omg.user_id = om.user_id AND omg.group_name = ce.cohort_name
            WHERE om.user_id = ?
              AND om.role = 'member'
              AND (omg.group_name IS NOT NULL OR ce.cohort_name = 'All Students')
            ORDER BY CASE WHEN omg.group_name IS NOT NULL THEN 0 ELSE 1 END,
                     ce.updated_at DESC
            LIMIT 1
            """,
            [str(user_id)],
        ).fetchone()
        if not row:
            return None

        subject_ids = json.loads(row["selected_subjects_json"] or "[]")
        if not subject_ids:
            return None

        placeholders = ",".join("?" * len(subject_ids))
        subject_rows = conn.execute(
            f"""
            SELECT gs.id, gs.subject_code, gs.subject_name, gs.pedagogy_mode, gs.order_index
            FROM grade_subjects gs
            WHERE gs.id IN ({placeholders})
            ORDER BY gs.order_index ASC
            """,
            subject_ids,
        ).fetchall()

        map_rows = conn.execute(
            f"""
            SELECT smm.lesson_id, smm.term, smm.unit_order, smm.unit_title, smm.pedagogy_mode,
                   gs.subject_code, gs.subject_name
            FROM syllabus_module_map smm
            JOIN grade_subjects gs ON gs.id = smm.grade_subject_id
            WHERE smm.grade_subject_id IN ({placeholders})
            ORDER BY gs.order_index ASC, smm.term ASC, smm.unit_order ASC
            """,
            subject_ids,
        ).fetchall()

        lesson_meta = {
            r["lesson_id"]: {
                "subject_code": r["subject_code"],
                "subject_name": r["subject_name"],
                "term": r["term"],
                "unit_order": r["unit_order"],
                "unit_title": r["unit_title"],
                "pedagogy_mode": r["pedagogy_mode"],
                "grade": row["grade"],
                "board": row["board"],
            }
            for r in map_rows
        }

        return {
            "scoped": bool(row["hide_public_tracks"]),
            "org_id": row["org_id"],
            "org_name": row["org_name"],
            "cohort_name": row["cohort_name"],
            "grade": row["grade"],
            "board": row["board"],
            "template_id": row["template_id"],
            "hide_public_tracks": bool(row["hide_public_tracks"]),
            "subjects": [dict(s) for s in subject_rows],
            "lesson_ids": [r["lesson_id"] for r in map_rows],
            "lesson_meta": lesson_meta,
        }
    finally:
        conn.close()


def teacher_allowed_cohorts(db_path: str, org_id: str, user_id: str, role: str) -> list[str] | None:
    """Return list of restricted cohort_names for a manager/teacher, or None if unrestricted.

    Admins / super_admins always have unrestricted visibility across the school (None).
    Managers who have rows in `cohort_teacher_assignments` are scoped strictly to those cohorts.
    Managers with no rows keep backward-compatible org visibility (None).
    """
    if role in ("admin", "super_admin"):
        return None
    conn = sqlite3.connect(db_path, timeout=10.0)
    try:
        has_tbl = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='cohort_teacher_assignments'"
        ).fetchone()
        if not has_tbl:
            return None
        rows = conn.execute(
            """
            SELECT DISTINCT cohort_name
            FROM cohort_teacher_assignments
            WHERE org_id = ? AND user_id = ?
            """,
            [org_id, user_id],
        ).fetchall()
        if not rows:
            return None
        return [r[0] for r in rows]
    finally:
        conn.close()
