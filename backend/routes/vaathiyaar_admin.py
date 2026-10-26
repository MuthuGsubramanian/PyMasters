"""
vaathiyaar_admin.py — operator visibility into the Vaathiyaar LLM provider chain
and the adaptive-intelligence loops.

GET  /api/admin/vaathiyaar/health   super-admin: provider chain, per-provider
                                    last-ok/last-error, the Ollama model the
                                    self-healing resolver currently targets,
                                    the live Ollama Cloud catalogue and any
                                    banned (retired) models.
POST /api/admin/vaathiyaar/refresh-model  super-admin: force a catalogue
                                    refresh + re-resolution right now.

Adaptive intelligence (see vaathiyaar/adaptive.py, 2026-10-27):
GET  /api/admin/vaathiyaar/adaptive            state: live insights version + rules,
                                               learner-note counts, recent runs
POST /api/admin/vaathiyaar/learn[?dry_run=1]   run the nightly learning cycle now
                                               (regression check → insights → learner notes)
GET  /api/admin/vaathiyaar/lesson-health       lessons ranked by code-evaluation pass rate
POST /api/admin/vaathiyaar/insights/{version}/deactivate   human override of a learned rule set

Why: Ollama Cloud retired qwen3.5 on 2026-09-25 and the provider silently
failed for a month. This surfaces drift in the console and for routines.
"""

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from routes.admin import require_super_admin
from vaathiyaar import engine
from vaathiyaar import adaptive

router = APIRouter(prefix="/api/admin/vaathiyaar", tags=["admin-vaathiyaar"])


def _db_path() -> str:
    import os
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


@router.get("/health")
def vaathiyaar_health(caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    return engine.provider_health()


@router.post("/refresh-model")
def vaathiyaar_refresh_model(caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    model = engine.resolve_ollama_model(force=True)
    return {"resolved_model": model, **engine.provider_health()["ollama"]}


@router.get("/adaptive")
def adaptive_state(caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    return adaptive.adaptive_status(_db_path())


@router.post("/learn")
def adaptive_learn(dry_run: bool = False, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    return adaptive.run_learning_cycle(_db_path(), dry_run=dry_run)


@router.get("/lesson-health")
def adaptive_lesson_health(days: int = 30, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    return {"days": days, "lessons": adaptive.lesson_health(_db_path(), days=max(1, min(days, 365)))}


@router.post("/insights/{version}/deactivate")
def adaptive_deactivate_insights(version: int, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    import sqlite3
    conn = sqlite3.connect(_db_path())
    try:
        cur = conn.execute("UPDATE tutor_insights SET active = 0 WHERE version = ? AND active = 1", [version])
        conn.commit()
    finally:
        conn.close()
    adaptive.invalidate_insights_cache()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="No active insights with that version")
    return {"deactivated_version": version, "rules": cur.rowcount}
