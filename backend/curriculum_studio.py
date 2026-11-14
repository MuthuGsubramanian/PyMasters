"""curriculum_studio.py — Enterprise & Training Center Curriculum Studio core logic:
- Schema tables: `syllabus_ingestions`, `org_curricula`, `org_curriculum_versions`, `cohort_delta_assignments`
- Explainable Curriculum Alignment Card builder (prerequisite chains, target competencies,
  estimated completion hours, hands-on lab coverage, per-module plain-language rationale)
- Semantic versioning (`v1.0` -> `v1.1`) & impact diff calculator
- Non-destructive cohort delta assignment (assigns ONLY newly added modules while preserving
  existing learner completions, earned XP, streaks, and verifiable `user_credentials`).
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any

LESSONS_DIR = Path(__file__).resolve().parent / "lessons"
CONCEPT_LINKS_PATH = Path(__file__).resolve().parent / "graph" / "concept_links.json"


def _db_path(explicit: str | None = None) -> str:
    return explicit or os.environ.get("DB_PATH", os.path.abspath("pymasters.db"))


def ensure_curriculum_studio_tables(db_path: str | None = None) -> None:
    target = _db_path(db_path)
    conn = sqlite3.connect(target, timeout=10.0)
    try:
        conn.execute("PRAGMA busy_timeout = 10000")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS syllabus_ingestions (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                title TEXT NOT NULL,
                source_type TEXT NOT NULL DEFAULT 'topics',
                filename TEXT DEFAULT '',
                extracted_topics_json TEXT NOT NULL DEFAULT '[]',
                match_results_json TEXT NOT NULL DEFAULT '[]',
                queued_jobs_json TEXT NOT NULL DEFAULT '[]',
                created_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_syllabus_ingestions_org
                ON syllabus_ingestions(org_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS org_curricula (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                group_name TEXT DEFAULT '',
                active_version TEXT NOT NULL DEFAULT 'v1.0',
                created_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_org_curricula_org
                ON org_curricula(org_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS org_curriculum_versions (
                id TEXT PRIMARY KEY,
                curriculum_id TEXT NOT NULL,
                version TEXT NOT NULL,
                modules_json TEXT NOT NULL DEFAULT '[]',
                blueprint_json TEXT NOT NULL DEFAULT '{}',
                changelog TEXT DEFAULT '',
                parent_version TEXT DEFAULT '',
                published_by TEXT DEFAULT '',
                published_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (curriculum_id, version)
            );

            CREATE TABLE IF NOT EXISTS cohort_delta_assignments (
                id TEXT PRIMARY KEY,
                curriculum_id TEXT NOT NULL,
                org_id TEXT NOT NULL,
                from_version TEXT DEFAULT '',
                to_version TEXT NOT NULL,
                group_name TEXT DEFAULT '',
                added_lesson_ids_json TEXT NOT NULL DEFAULT '[]',
                removed_lesson_ids_json TEXT NOT NULL DEFAULT '[]',
                assigned_count INTEGER NOT NULL DEFAULT 0,
                assigned_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS cohort_assigned_modules (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                curriculum_id TEXT NOT NULL,
                version TEXT NOT NULL,
                group_name TEXT DEFAULT '',
                user_id TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (org_id, user_id, lesson_id)
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def _load_lesson_metadata(conn: sqlite3.Connection, lesson_id: str) -> dict[str, Any]:
    """Resolve metadata for static, generated, or school lessons cleanly."""
    if not lesson_id or lesson_id.startswith("pending:"):
        return {}
    # 1. Check generated_lessons
    try:
        row = conn.execute(
            "SELECT lesson_data FROM generated_lessons WHERE id = ?", [lesson_id]
        ).fetchone()
        if row and row[0]:
            return json.loads(row[0])
    except Exception:
        pass
    # 2. Check school_concept_lessons
    try:
        row = conn.execute(
            "SELECT lesson_data FROM school_concept_lessons WHERE lesson_id = ?", [lesson_id]
        ).fetchone()
        if row and row[0]:
            return json.loads(row[0])
    except Exception:
        pass
    # 3. Check static lesson JSON
    for fp in LESSONS_DIR.rglob(f"{lesson_id}.json"):
        try:
            return json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            break
    # Fallback full scan if filename != id
    for fp in LESSONS_DIR.rglob("*.json"):
        if fp.name == "schema.json":
            continue
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
            if d.get("id") == lesson_id:
                return d
        except Exception:
            continue
    return {}


def build_alignment_blueprint(
    conn: sqlite3.Connection,
    modules: list[dict[str, Any]],
    title: str,
) -> dict[str, Any]:
    """Generate a plain-language Explainable Curriculum Alignment Card from ordered modules."""
    competencies: list[str] = []
    seen_comp: set[str] = set()
    prereq_chain: list[dict[str, Any]] = []
    module_rationales: list[dict[str, Any]] = []

    total_minutes = 0
    lab_count = 0

    for idx, mod in enumerate(modules):
        lid = str(mod.get("lesson_id") or "").strip()
        topic = str(mod.get("topic") or mod.get("title") or lid or f"Module {idx + 1}").strip()
        meta = _load_lesson_metadata(conn, lid) if lid else {}

        tags = meta.get("tags") or {}
        if isinstance(tags, dict):
            taught = tags.get("concepts_taught") or []
            req = tags.get("concepts_required") or []
        else:
            taught = []
            req = []

        # Collect target competencies
        for comp in taught or [topic]:
            clean = str(comp).replace("_", " ").strip()
            if clean and clean.lower() not in seen_comp:
                seen_comp.add(clean.lower())
                competencies.append(clean)

        has_lab = bool(
            meta.get("practice_challenges")
            or meta.get("animation_sequence")
            or mod.get("pedagogy_mode") == "coding_ide"
            or (lid and not lid.startswith("school_"))
        )
        if has_lab:
            lab_count += 1

        est_mins = int(mod.get("estimated_minutes") or (45 if has_lab else 30))
        total_minutes += est_mins

        prev_topic = modules[idx - 1].get("topic") if idx > 0 else None
        prereq_names = [str(r).replace("_", " ") for r in req[:3]]
        if not prereq_names and prev_topic:
            prereq_names = [str(prev_topic)]

        score = mod.get("score")
        source = mod.get("source") or ("generated" if lid.startswith("gen_") else "matched")
        if source == "generated" or str(mod.get("status")) == "gap_queued":
            why = (
                f"Custom-synthesized for your syllabus topic '{topic}' to fill a skill gap "
                "with verified AST hands-on challenges and visual traces."
            )
        elif score is not None:
            pct = int(round(float(score) * 100))
            why = (
                f"Matched your syllabus requirement '{topic}' ({pct}% semantic alignment)"
                + (f" and builds cleanly on {', '.join(prereq_names)}." if prereq_names else ".")
            )
        else:
            why = f"Builds core mastery in '{topic}' in sequence for {title}."

        prereq_chain.append(
            {
                "order": idx + 1,
                "lesson_id": lid,
                "topic": topic,
                "prerequisites": prereq_names,
            }
        )
        module_rationales.append(
            {
                "order": idx + 1,
                "lesson_id": lid,
                "topic": topic,
                "has_hands_on_lab": has_lab,
                "estimated_minutes": est_mins,
                "prerequisites": prereq_names,
                "why_included": why,
            }
        )

    mod_total = max(len(modules), 1)
    lab_coverage_pct = int(round((lab_count / mod_total) * 100)) if modules else 0
    estimated_hours = round(total_minutes / 60.0, 1)

    return {
        "curriculum_title": title,
        "summary": (
            f"{title} spans {len(modules)} sequenced modules (~{estimated_hours} hrs) "
            f"with {lab_coverage_pct}% hands-on coding & trace labs."
        ),
        "target_competencies": competencies[:12],
        "prerequisite_chains": prereq_chain,
        "estimated_hours": estimated_hours,
        "hands_on_lab_coverage_pct": lab_coverage_pct,
        "module_rationales": module_rationales,
    }


def next_semantic_version(current: str, bump: str = "minor") -> str:
    """Increment `v1.0` -> `v1.1` (minor) or `v2.0` (major)."""
    raw = (current or "v1.0").lstrip("vV")
    parts = raw.split(".")
    try:
        major = int(parts[0])
        minor = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return "v1.1"
    if bump == "major":
        return f"v{major + 1}.0"
    return f"v{major}.{minor + 1}"


def compute_version_impact_diff(
    conn: sqlite3.Connection,
    org_id: str,
    group_name: str,
    old_modules: list[dict[str, Any]],
    new_modules: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compute added/removed/unchanged delta between two curriculum versions and affected learners."""
    old_by_key = {str(m.get("lesson_id") or m.get("topic")): m for m in old_modules}
    new_by_key = {str(m.get("lesson_id") or m.get("topic")): m for m in new_modules}

    added = [m for k, m in new_by_key.items() if k not in old_by_key]
    removed = [m for k, m in old_by_key.items() if k not in new_by_key]
    unchanged = [m for k, m in new_by_key.items() if k in old_by_key]

    if group_name:
        learner_count = conn.execute(
            "SELECT COUNT(DISTINCT user_id) FROM org_member_groups WHERE org_id = ? AND group_name = ?",
            [org_id, group_name],
        ).fetchone()[0]
    else:
        learner_count = conn.execute(
            "SELECT COUNT(DISTINCT user_id) FROM org_members WHERE org_id = ?",
            [org_id],
        ).fetchone()[0]

    return {
        "added_modules": added,
        "removed_modules": removed,
        "unchanged_count": len(unchanged),
        "affected_learners": int(learner_count or 0),
        "delta_lesson_ids": [str(m.get("lesson_id")) for m in added if m.get("lesson_id")],
        "preserved_records": {
            "xp": True,
            "streaks": True,
            "lesson_completions": True,
            "verifiable_credentials": True,
        },
    }


def apply_delta_cohort_assignment(
    conn: sqlite3.Connection,
    org_id: str,
    curriculum_id: str,
    from_version: str,
    to_version: str,
    group_name: str,
    added_modules: list[dict[str, Any]],
    removed_modules: list[dict[str, Any]],
    assigned_by: str,
) -> dict[str, Any]:
    """Assign ONLY newly added delta modules to target cohort learners, never touching XP/streaks/credentials."""
    if group_name:
        user_rows = conn.execute(
            "SELECT DISTINCT user_id FROM org_member_groups WHERE org_id = ? AND group_name = ?",
            [org_id, group_name],
        ).fetchall()
    else:
        user_rows = conn.execute(
            "SELECT DISTINCT user_id FROM org_members WHERE org_id = ?",
            [org_id],
        ).fetchall()
    target_users = [str(r[0]) for r in user_rows if r and r[0]]

    added_lesson_ids = [str(m.get("lesson_id")) for m in added_modules if m.get("lesson_id")]
    removed_lesson_ids = [str(m.get("lesson_id")) for m in removed_modules if m.get("lesson_id")]

    assigned_writes = 0
    for uid in target_users:
        for lid in added_lesson_ids:
            # Skip already completed lessons so we never reset prior mastery or XP
            already_done = conn.execute(
                "SELECT 1 FROM lesson_completions WHERE CAST(user_id AS TEXT) = ? AND lesson_id = ?",
                [uid, lid],
            ).fetchone()
            if already_done:
                continue
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO cohort_assigned_modules
                    (id, org_id, curriculum_id, version, group_name, user_id, lesson_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [str(uuid.uuid4()), org_id, curriculum_id, to_version, group_name, uid, lid],
            )
            if cur.rowcount:
                assigned_writes += 1

    conn.execute(
        """
        INSERT INTO cohort_delta_assignments
            (id, curriculum_id, org_id, from_version, to_version, group_name,
             added_lesson_ids_json, removed_lesson_ids_json, assigned_count, assigned_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            str(uuid.uuid4()),
            curriculum_id,
            org_id,
            from_version,
            to_version,
            group_name,
            json.dumps(added_lesson_ids),
            json.dumps(removed_lesson_ids),
            assigned_writes,
            assigned_by,
        ],
    )
    return {
        "target_learners": len(target_users),
        "delta_lessons_count": len(added_lesson_ids),
        "new_assignments_created": assigned_writes,
        "preserved_records": {
            "xp": True,
            "streaks": True,
            "lesson_completions": True,
            "verifiable_credentials": True,
        },
    }
