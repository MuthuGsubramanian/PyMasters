"""
vaathiyaar_admin.py — operator visibility into the Vaathiyaar LLM provider chain.

GET  /api/admin/vaathiyaar/health   super-admin: provider chain, per-provider
                                    last-ok/last-error, the Ollama model the
                                    self-healing resolver currently targets,
                                    the live Ollama Cloud catalogue and any
                                    banned (retired) models.
POST /api/admin/vaathiyaar/refresh-model  super-admin: force a catalogue
                                    refresh + re-resolution right now.

Why: Ollama Cloud retired qwen3.5 on 2026-09-25 and the provider silently
failed for a month. This surfaces drift in the console and for routines.
"""

from fastapi import APIRouter, Depends

from auth import get_current_user_id
from routes.admin import require_super_admin
from vaathiyaar import engine

router = APIRouter(prefix="/api/admin/vaathiyaar", tags=["admin-vaathiyaar"])


@router.get("/health")
def vaathiyaar_health(caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    return engine.provider_health()


@router.post("/refresh-model")
def vaathiyaar_refresh_model(caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    model = engine.resolve_ollama_model(force=True)
    return {"resolved_model": model, **engine.provider_health()["ollama"]}
