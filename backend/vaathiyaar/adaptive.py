"""
adaptive.py — the part of Vaathiyaar that LEARNS between sessions (2026-10-27).

Three loops, all driven by signals the platform already records (code
evaluations, lesson views, the model's own profile_update, outcome-scored
training pairs), because explicit 👍/👎 ratings are rare:

1. Scaffolding (per request, no LLM): mastery + the last two weeks of
   evaluation outcomes and emotion signals → a scaffolding level
   (high / medium / low) with reasons, rendered into the system prompt so the
   tutor teaches in smaller steps for a struggling learner and gets out of
   the way for a confident one.

2. Learner notes (nightly, LLM): for every learner active in the last week,
   distil their recent conversations + signals into ≤5 short notes
   (misconceptions, preferences, strengths, context). The next session's prompt
   carries them ("what you already know about this student"). Notes are
   visible and deletable by the learner (GET/DELETE /api/profile/{id}/learner-notes).

3. Tutor insights (nightly, LLM, versioned): compare recent high-outcome and
   low-outcome tutor turns and distil ≤8 general teaching rules. Each run is a
   new version; the previous version is kept. A regression check compares the
   outcome ratio (share of scored pairs ≥ 0.8) in the 7 days after a version
   went live against the 7 days before — a drop of ≥ 15 points on ≥ 20 pairs
   deactivates that version automatically. VAATHIYAAR_ADAPTIVE=0 disables all
   prompt injection without touching data.

Everything is best-effort: any failure degrades to "no adaptive context",
never to a failed request.
"""

import json
import os
import re
import sqlite3
import time
import uuid
from typing import Callable, Optional

ADAPTIVE_ENABLED = os.getenv("VAATHIYAAR_ADAPTIVE", "1").strip().lower() not in ("0", "false", "off", "")
NOTE_KINDS = ("misconception", "preference", "strength", "context")
MAX_NOTES_PER_LEARNER = 5
MAX_INSIGHTS = 8
REGRESSION_MIN_PAIRS = 20
REGRESSION_DROP = 0.15
_INSIGHTS_CACHE = {"at": 0.0, "db": "", "rules": []}
_INSIGHTS_TTL = 300

TABLES_SQL = [
    """CREATE TABLE IF NOT EXISTS learner_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        note TEXT NOT NULL,
        evidence TEXT,
        weight REAL DEFAULT 1.0,
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS idx_learner_notes_user ON learner_notes(user_id, active)",
    """CREATE TABLE IF NOT EXISTS tutor_insights (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        rule TEXT NOT NULL,
        evidence TEXT,
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS adaptive_runs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP,
        ok INTEGER DEFAULT 1,
        summary TEXT
    )""",
]


# ───────────────────────────── storage helpers ─────────────────────────────

def ensure_tables(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        for sql in TABLES_SQL:
            conn.execute(sql)
        conn.commit()
    finally:
        conn.close()


def _conn(db_path: str) -> sqlite3.Connection:
    ensure_tables(db_path)
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    return conn


def _log_run(db_path: str, kind: str, ok: bool, summary: dict) -> str:
    run_id = str(uuid.uuid4())
    conn = _conn(db_path)
    try:
        conn.execute(
            "INSERT INTO adaptive_runs (id, kind, finished_at, ok, summary) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)",
            [run_id, kind, 1 if ok else 0, json.dumps(summary)[:4000]],
        )
        conn.commit()
    finally:
        conn.close()
    return run_id


def _loads(text, default):
    try:
        return json.loads(text) if text else default
    except Exception:
        return default


# ───────────────────────────── loop 1: scaffolding ─────────────────────────

def scaffolding_for(db_path: str, user_id: str) -> dict:
    """Derive how much support this learner needs right now from implicit signals."""
    conn = _conn(db_path)
    try:
        mastery = conn.execute(
            "SELECT topic, mastery_level, attempts, struggle_count FROM user_mastery WHERE user_id = ?",
            [user_id],
        ).fetchall()
        evals = conn.execute(
            "SELECT value FROM learning_signals WHERE user_id = ? AND signal_type = 'code_evaluation' "
            "AND created_at > datetime('now', '-14 days') ORDER BY created_at DESC LIMIT 20",
            [user_id],
        ).fetchall()
        updates = conn.execute(
            "SELECT value FROM learning_signals WHERE user_id = ? AND signal_type IN ('profile_update', 'profile_updated') "
            "AND created_at > datetime('now', '-14 days') ORDER BY created_at DESC LIMIT 10",
            [user_id],
        ).fetchall()
    finally:
        conn.close()

    weak = [r["topic"] for r in mastery if (r["mastery_level"] or 0) < 0.4]
    strong = [r["topic"] for r in mastery if (r["mastery_level"] or 0) >= 0.7]
    outcomes = [bool(_loads(r["value"], {}).get("success")) for r in evals]
    fails = outcomes.count(False)
    fail_rate = (fails / len(outcomes)) if outcomes else None
    emotions, struggles = [], 0
    for r in updates:
        v = _loads(r["value"], {})
        if isinstance(v, dict):
            if v.get("emotion_signal"):
                emotions.append(str(v["emotion_signal"]).lower())
            if v.get("struggle_detected"):
                struggles += 1
    negative = sum(1 for e in emotions if e in ("frustrated", "confused"))
    positive = sum(1 for e in emotions if e in ("confident", "excited"))

    reasons = []
    level = "medium"
    if (fail_rate is not None and len(outcomes) >= 2 and fail_rate >= 0.5):
        level = "high"; reasons.append(f"{fails} of the last {len(outcomes)} code attempts failed")
    if negative >= 2 or struggles >= 2:
        level = "high"; reasons.append("recent turns showed confusion or frustration")
    if len(weak) >= 2 and not strong:
        level = "high"; reasons.append(f"low mastery in {', '.join(weak[:3])}")
    if level != "high" and fail_rate is not None and len(outcomes) >= 3 and fail_rate <= 0.2 and negative == 0 and not weak:
        level = "low"; reasons.append(f"{len(outcomes) - fails} of the last {len(outcomes)} attempts passed")
        if positive:
            reasons.append("recent turns read confident")
    if not reasons:
        reasons.append("not enough recent signal — default pacing")
    return {
        "level": level,
        "reasons": reasons,
        "weak_topics": weak[:5],
        "strong_topics": strong[:5],
        "recent_fail_rate": round(fail_rate, 2) if fail_rate is not None else None,
        "recent_emotions": emotions[:5],
    }


# ───────────────────────────── loop 2: learner notes ───────────────────────

def learner_notes(db_path: str, user_id: str, limit: int = MAX_NOTES_PER_LEARNER + 1) -> list:
    conn = _conn(db_path)
    try:
        rows = conn.execute(
            "SELECT id, kind, note, evidence, weight, created_at FROM learner_notes "
            "WHERE user_id = ? AND active = 1 ORDER BY weight DESC, created_at DESC LIMIT ?",
            [user_id, limit],
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_learner_note(db_path: str, user_id: str, note_id: str) -> bool:
    conn = _conn(db_path)
    try:
        cur = conn.execute("UPDATE learner_notes SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND active = 1",
                           [note_id, user_id])
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _learner_material(db_path: str, user_id: str, days: int = 7) -> dict:
    conn = _conn(db_path)
    try:
        pairs = conn.execute(
            "SELECT input_text, output_text, quality_score, created_at FROM training_data "
            "WHERE json_extract(profile_json, '$.user_id') = ? AND created_at > datetime('now', ?) "
            "ORDER BY created_at DESC LIMIT 12",
            [user_id, f"-{days} days"],
        ).fetchall()
        signals = conn.execute(
            "SELECT signal_type, topic, value, created_at FROM learning_signals WHERE user_id = ? "
            "AND created_at > datetime('now', ?) ORDER BY created_at DESC LIMIT 30",
            [user_id, f"-{days} days"],
        ).fetchall()
        mastery = conn.execute(
            "SELECT topic, mastery_level, attempts, struggle_count FROM user_mastery WHERE user_id = ? ORDER BY last_practiced DESC LIMIT 12",
            [user_id],
        ).fetchall()
        prof = conn.execute(
            "SELECT skill_level, goal, learning_style, preferred_language, known_languages FROM user_profiles WHERE user_id = ?",
            [user_id],
        ).fetchone()
    finally:
        conn.close()
    turns = []
    for p in pairs:
        out = _loads(p["output_text"], {})
        msg = out.get("message") if isinstance(out, dict) else str(p["output_text"])
        turns.append({"student": (p["input_text"] or "")[-500:], "tutor": (str(msg) or "")[:500],
                      "outcome": p["quality_score"], "at": p["created_at"]})
    return {
        "profile": dict(prof) if prof else {},
        "mastery": [dict(m) for m in mastery],
        "signals": [{"type": s["signal_type"], "topic": s["topic"], "value": (s["value"] or "")[:160], "at": s["created_at"]} for s in signals],
        "turns": turns,
        "existing_notes": [n["note"] for n in learner_notes(db_path, user_id)],
    }


_NOTES_PROMPT = """You are the memory of Vaathiyaar, a patient Python/AI tutor. From the material about ONE learner below, write at most {max_notes} short notes the tutor should remember next time. Each note must be:
- specific and actionable for teaching (a recurring misconception, a preference in explanation style or analogies, a demonstrated strength, or relevant context such as goals or tools they use)
- grounded in the material (cite the evidence briefly)
- free of personal data beyond what is needed for teaching; never mention emails, phone numbers or payments
- written in the second person about the learner ("Confuses list .append with list concatenation").

Return ONLY a JSON array like:
[{{"kind": "misconception|preference|strength|context", "note": "...", "evidence": "...", "weight": 0.5-1.0}}]
Return [] if nothing is worth remembering. Existing notes (refine or keep the ones still true, drop stale ones): {existing}

MATERIAL:
{material}
"""


def _parse_json_array(text: str) -> list:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        data = json.loads(text[start:end + 1])
    except Exception:
        return []
    return data if isinstance(data, list) else []


def distill_learner(db_path: str, user_id: str, llm: Callable[[list, dict], str]) -> dict:
    material = _learner_material(db_path, user_id)
    if len(material["turns"]) + len(material["signals"]) < 3:
        return {"user_id": user_id, "skipped": "too little material"}
    prompt = _NOTES_PROMPT.format(max_notes=MAX_NOTES_PER_LEARNER, existing=json.dumps(material["existing_notes"]),
                                  material=json.dumps({k: v for k, v in material.items() if k != "existing_notes"}, ensure_ascii=False)[:9000])
    raw = llm([{"role": "system", "content": "You write terse, factual tutoring memory notes as JSON."},
               {"role": "user", "content": prompt}], {"temperature": 0.2, "num_predict": 700})
    notes = []
    for item in _parse_json_array(raw)[:MAX_NOTES_PER_LEARNER]:
        if not isinstance(item, dict):
            continue
        note = str(item.get("note") or "").strip()[:280]
        kind = str(item.get("kind") or "context").strip().lower()
        if len(note) < 8 or kind not in NOTE_KINDS:
            continue
        try:
            weight = max(0.1, min(1.0, float(item.get("weight", 0.7))))
        except Exception:
            weight = 0.7
        notes.append({"kind": kind, "note": note, "evidence": str(item.get("evidence") or "")[:300], "weight": weight})
    if not notes:
        return {"user_id": user_id, "skipped": "model produced no usable notes", "raw": (raw or "")[:200]}
    conn = _conn(db_path)
    try:
        conn.execute("UPDATE learner_notes SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND active = 1", [user_id])
        for n in notes:
            conn.execute("INSERT INTO learner_notes (id, user_id, kind, note, evidence, weight) VALUES (?, ?, ?, ?, ?, ?)",
                         [str(uuid.uuid4()), user_id, n["kind"], n["note"], n["evidence"], n["weight"]])
        conn.commit()
    finally:
        conn.close()
    return {"user_id": user_id, "notes": len(notes)}


def active_learners(db_path: str, days: int = 7, min_events: int = 3) -> list:
    conn = _conn(db_path)
    try:
        rows = conn.execute(
            "SELECT user_id, COUNT(*) AS n FROM ("
            "  SELECT user_id FROM learning_signals WHERE created_at > datetime('now', ?)"
            "  UNION ALL SELECT json_extract(profile_json, '$.user_id') FROM training_data WHERE created_at > datetime('now', ?)"
            ") WHERE user_id IS NOT NULL AND user_id != '' GROUP BY user_id HAVING n >= ? ORDER BY n DESC LIMIT 50",
            [f"-{days} days", f"-{days} days", min_events],
        ).fetchall()
        return [r["user_id"] for r in rows]
    finally:
        conn.close()


# ───────────────────────────── loop 3: tutor insights ──────────────────────

def active_insights(db_path: str, limit: int = MAX_INSIGHTS) -> list:
    now = time.time()
    if _INSIGHTS_CACHE["db"] == db_path and now - _INSIGHTS_CACHE["at"] < _INSIGHTS_TTL:
        return _INSIGHTS_CACHE["rules"][:limit]
    conn = _conn(db_path)
    try:
        ver = conn.execute("SELECT MAX(version) FROM tutor_insights WHERE active = 1").fetchone()[0]
        rules = []
        if ver is not None:
            rules = [r["rule"] for r in conn.execute(
                "SELECT rule FROM tutor_insights WHERE version = ? AND active = 1 ORDER BY rowid LIMIT ?", [ver, limit]).fetchall()]
    finally:
        conn.close()
    _INSIGHTS_CACHE.update({"at": now, "db": db_path, "rules": rules})
    return rules


def invalidate_insights_cache() -> None:
    _INSIGHTS_CACHE["at"] = 0.0


def _outcome_pairs(db_path: str, days: int = 30, k: int = 15) -> tuple:
    conn = _conn(db_path)
    try:
        good = conn.execute(
            "SELECT input_text, output_text FROM training_data WHERE quality_score >= 0.8 AND created_at > datetime('now', ?) "
            "ORDER BY created_at DESC LIMIT ?", [f"-{days} days", k]).fetchall()
        bad = conn.execute(
            "SELECT input_text, output_text FROM training_data WHERE quality_score IS NOT NULL AND quality_score < 0.5 "
            "AND created_at > datetime('now', ?) ORDER BY created_at DESC LIMIT ?", [f"-{days} days", k]).fetchall()
    finally:
        conn.close()

    def shape(rows):
        out = []
        for r in rows:
            o = _loads(r["output_text"], {})
            msg = o.get("message") if isinstance(o, dict) else str(r["output_text"])
            out.append({"student": (r["input_text"] or "")[-400:], "tutor": str(msg or "")[:600]})
        return out
    return shape(good), shape(bad)


_INSIGHTS_PROMPT = """You coach Vaathiyaar, PyMasters' Python/AI tutor. Below are recent tutor turns that led to a GOOD outcome (the learner's next code attempt passed) and turns that led to a POOR outcome (the next attempt failed or the learner stayed stuck).

Infer at most {max_rules} concrete, general teaching rules that distinguish the good turns from the poor ones for THIS audience. Rules must be:
- actionable instructions for the tutor's next reply (length, structure, when to show code vs ask a question, how to handle errors, pacing, analogies)
- specific to patterns actually visible in the examples (cite which pattern as evidence)
- not restatements of generic pedagogy, and never about personal data.

Return ONLY a JSON array: [{{"rule": "...", "evidence": "..."}}]. Return [] if the data does not support any rule.

GOOD OUTCOME TURNS:
{good}

POOR OUTCOME TURNS:
{bad}
"""


def distill_insights(db_path: str, llm: Callable[[list, dict], str], min_examples: int = 4) -> dict:
    good, bad = _outcome_pairs(db_path)
    if len(good) < min_examples or len(bad) < min_examples:
        return {"skipped": f"not enough contrast yet (good={len(good)}, poor={len(bad)}, need {min_examples} each)"}
    prompt = _INSIGHTS_PROMPT.format(max_rules=MAX_INSIGHTS, good=json.dumps(good, ensure_ascii=False)[:9000],
                                     bad=json.dumps(bad, ensure_ascii=False)[:9000])
    raw = llm([{"role": "system", "content": "You distil tutoring data into precise rules as JSON."},
               {"role": "user", "content": prompt}], {"temperature": 0.2, "num_predict": 900})
    rules = []
    for item in _parse_json_array(raw)[:MAX_INSIGHTS]:
        if isinstance(item, dict):
            rule = str(item.get("rule") or "").strip()[:300]
            if len(rule) >= 12:
                rules.append({"rule": rule, "evidence": str(item.get("evidence") or "")[:300]})
    if len(rules) < 3:
        return {"skipped": "model produced fewer than 3 usable rules", "raw": (raw or "")[:200]}
    conn = _conn(db_path)
    try:
        prev = conn.execute("SELECT COALESCE(MAX(version), 0) FROM tutor_insights").fetchone()[0]
        version = int(prev) + 1
        conn.execute("UPDATE tutor_insights SET active = 0 WHERE active = 1")
        for r in rules:
            conn.execute("INSERT INTO tutor_insights (id, version, rule, evidence) VALUES (?, ?, ?, ?)",
                         [str(uuid.uuid4()), version, r["rule"], r["evidence"]])
        conn.commit()
    finally:
        conn.close()
    invalidate_insights_cache()
    return {"version": version, "rules": len(rules), "good_examples": len(good), "poor_examples": len(bad)}


def outcome_ratio(db_path: str, start: str, end: str) -> tuple:
    """(share of scored pairs with quality ≥ 0.8, count) between two SQLite datetime expressions."""
    conn = _conn(db_path)
    try:
        row = conn.execute(
            "SELECT AVG(CASE WHEN quality_score >= 0.8 THEN 1.0 ELSE 0.0 END), COUNT(*) FROM training_data "
            "WHERE quality_score IS NOT NULL AND created_at >= ? AND created_at < ?", [start, end]).fetchone()
        return (float(row[0]) if row[0] is not None else None, int(row[1]))
    finally:
        conn.close()


def check_insights_regression(db_path: str) -> dict:
    """Deactivate the live insights version if outcomes dropped since it went live."""
    conn = _conn(db_path)
    try:
        row = conn.execute("SELECT version, MIN(created_at) AS live_at FROM tutor_insights WHERE active = 1 GROUP BY version "
                           "ORDER BY version DESC LIMIT 1").fetchone()
        if not row:
            return {"checked": False, "reason": "no active insights"}
        version, live_at = row["version"], row["live_at"]
        age_days = conn.execute("SELECT julianday('now') - julianday(?)", [live_at]).fetchone()[0]
    finally:
        conn.close()
    if age_days < 2:
        return {"checked": False, "version": version, "reason": "live for less than 2 days"}
    after, n_after = outcome_ratio(db_path, live_at, "9999-12-31")
    conn = _conn(db_path)
    try:
        before_start = conn.execute("SELECT datetime(?, '-7 days')", [live_at]).fetchone()[0]
    finally:
        conn.close()
    before, n_before = outcome_ratio(db_path, before_start, live_at)
    result = {"checked": True, "version": version, "before": before, "n_before": n_before, "after": after, "n_after": n_after}
    if (before is not None and after is not None and n_after >= REGRESSION_MIN_PAIRS and n_before >= REGRESSION_MIN_PAIRS
            and before - after >= REGRESSION_DROP):
        conn = _conn(db_path)
        try:
            conn.execute("UPDATE tutor_insights SET active = 0 WHERE version = ?", [version])
            prev = conn.execute("SELECT MAX(version) FROM tutor_insights WHERE version < ?", [version]).fetchone()[0]
            if prev is not None:
                conn.execute("UPDATE tutor_insights SET active = 1 WHERE version = ?", [prev])
            conn.commit()
        finally:
            conn.close()
        invalidate_insights_cache()
        result.update({"rolled_back": True, "restored_version": prev})
    return result


# ───────────────────────────── loop 4: lesson health ───────────────────────

def lesson_health(db_path: str, days: int = 30, limit: int = 40) -> list:
    conn = _conn(db_path)
    try:
        rows = conn.execute(
            "SELECT json_extract(value, '$.lesson_id') AS lesson_id, topic, "
            "SUM(CASE WHEN json_extract(value, '$.success') IN (1, 'true') THEN 1 ELSE 0 END) AS passed, COUNT(*) AS attempts, "
            "COUNT(DISTINCT user_id) AS learners "
            "FROM learning_signals WHERE signal_type = 'code_evaluation' AND created_at > datetime('now', ?) "
            "GROUP BY lesson_id, topic HAVING attempts >= 2 ORDER BY (passed * 1.0 / attempts) ASC, attempts DESC LIMIT ?",
            [f"-{days} days", limit]).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        attempts = r["attempts"] or 0
        out.append({"lesson_id": r["lesson_id"], "topic": r["topic"], "attempts": attempts, "passed": r["passed"] or 0,
                    "learners": r["learners"], "pass_rate": round((r["passed"] or 0) / attempts, 2) if attempts else None,
                    "flag": "revise" if attempts >= 4 and (r["passed"] or 0) / attempts < 0.4 else ""})
    return out


# ───────────────────────────── prompt rendering ────────────────────────────

def adaptive_context(db_path: str, user_id: str) -> dict:
    """Everything build_system_prompt needs; empty dict when disabled or on error."""
    if not ADAPTIVE_ENABLED or not user_id:
        return {}
    try:
        return {"scaffolding": scaffolding_for(db_path, user_id),
                "notes": learner_notes(db_path, user_id, MAX_NOTES_PER_LEARNER),
                "insights": active_insights(db_path)}
    except Exception as exc:  # noqa: BLE001
        print(f"[adaptive] context unavailable: {str(exc)[:120]}")
        return {}


_SCAFFOLD_TEXT = {
    "high": ("Scaffolding level: HIGH. Teach in smaller steps: one idea per reply, a worked example before any exercise, "
             "check understanding with a single short question, and name the exact line when fixing errors. Celebrate small wins."),
    "medium": "Scaffolding level: MEDIUM. Standard pacing: explain, show one example, then let them try.",
    "low": ("Scaffolding level: LOW. This learner is doing well: be concise, skip the basics they have shown, "
            "offer a stretch challenge or a 'why it works' insight instead of repetition."),
}


def prompt_blocks(adaptive: dict) -> list:
    """Render the adaptive context as system-prompt sections (pure function; unit-tested)."""
    if not adaptive:
        return []
    blocks = []
    sc = adaptive.get("scaffolding") or {}
    if sc.get("level"):
        blocks.append("\n## Adaptive Pacing (learned from this student's recent sessions)")
        blocks.append(_SCAFFOLD_TEXT.get(sc["level"], _SCAFFOLD_TEXT["medium"]))
        if sc.get("reasons"):
            blocks.append("Why: " + "; ".join(sc["reasons"][:3]) + ".")
    notes = adaptive.get("notes") or []
    if notes:
        blocks.append("\n## What You Already Know About This Student")
        for n in notes[:MAX_NOTES_PER_LEARNER]:
            blocks.append(f"- ({n.get('kind', 'context')}) {n.get('note', '')}")
        blocks.append("Use these quietly — build on strengths, pre-empt the misconceptions, match the preferences. Do not recite them.")
    insights = adaptive.get("insights") or []
    if insights:
        blocks.append("\n## Teaching Insights Learned From Past Sessions")
        blocks.append("Patterns distilled from what actually helped PyMasters learners (follow unless they conflict with the rules above):")
        for rule in insights[:MAX_INSIGHTS]:
            blocks.append(f"- {rule}")
    return blocks


# ───────────────────────────── orchestration ───────────────────────────────

def _default_llm():
    from vaathiyaar.engine import complete  # lazy: engine imports are heavy
    return complete


def run_learning_cycle(db_path: str, llm: Optional[Callable] = None, dry_run: bool = False) -> dict:
    """Nightly job: regression check → tutor insights → learner notes. Returns a summary and logs it."""
    started = time.time()
    llm = llm or _default_llm()
    summary = {"dry_run": dry_run, "learners": [], "insights": None, "regression": None, "errors": []}
    try:
        summary["regression"] = check_insights_regression(db_path)
    except Exception as exc:  # noqa: BLE001
        summary["errors"].append(f"regression: {str(exc)[:160]}")
    if not dry_run:
        try:
            summary["insights"] = distill_insights(db_path, llm)
        except Exception as exc:  # noqa: BLE001
            summary["errors"].append(f"insights: {str(exc)[:160]}")
    users = active_learners(db_path)
    summary["active_learners"] = len(users)
    if not dry_run:
        for uid in users:
            try:
                summary["learners"].append(distill_learner(db_path, uid, llm))
            except Exception as exc:  # noqa: BLE001
                summary["errors"].append(f"learner {uid[:8]}: {str(exc)[:160]}")
    summary["seconds"] = round(time.time() - started, 1)
    summary["run_id"] = _log_run(db_path, "learning_cycle", not summary["errors"], summary)
    return summary


def adaptive_status(db_path: str) -> dict:
    conn = _conn(db_path)
    try:
        ver = conn.execute("SELECT MAX(version) FROM tutor_insights WHERE active = 1").fetchone()[0]
        rules = [dict(r) for r in conn.execute(
            "SELECT version, rule, evidence, created_at FROM tutor_insights WHERE active = 1 ORDER BY rowid").fetchall()]
        versions = conn.execute("SELECT COUNT(DISTINCT version) FROM tutor_insights").fetchone()[0]
        notes_users = conn.execute("SELECT COUNT(DISTINCT user_id), COUNT(*) FROM learner_notes WHERE active = 1").fetchone()
        runs = [dict(r) for r in conn.execute(
            "SELECT kind, started_at, finished_at, ok, summary FROM adaptive_runs ORDER BY started_at DESC LIMIT 5").fetchall()]
    finally:
        conn.close()
    for r in runs:
        r["summary"] = _loads(r.get("summary"), {})
    return {"enabled": ADAPTIVE_ENABLED, "insights": {"active_version": ver, "versions": versions, "rules": rules},
            "learner_notes": {"learners": notes_users[0], "notes": notes_users[1]}, "recent_runs": runs,
            "active_learners_7d": len(active_learners(db_path))}
