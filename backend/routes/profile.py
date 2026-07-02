"""
profile.py — FastAPI APIRouter for student profile management.

Prefix: /api/profile
"""

import os
import sqlite3
import random
from datetime import datetime, date
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from vaathiyaar.profiler import save_onboarding, get_student_profile, record_signal
from auth import get_current_user_id

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _require_self(user_id: str, caller: str) -> None:
    """Authorization guard for the /{user_id} self-service endpoints.

    Every endpoint under this prefix operates on the *caller's own* account
    (the frontend always calls these with its own user.id). Without this guard
    the user_id is a client-supplied path param with no verification, so any
    party — including unauthenticated ones — could read another user's PII
    (email, contact links), export their full account, or reset/delete it
    (classic IDOR). Deriving the acting user from the verified JWT and refusing
    cross-user access closes that hole. Mirrors the pattern in admin.py.
    """
    if caller != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")


def _relative_time(ts) -> str:
    """Human-friendly 'time ago' for a SQLite timestamp string (stored UTC via
    CURRENT_TIMESTAMP, format 'YYYY-MM-DD HH:MM:SS'). Returns '' on any parse
    failure so callers can degrade gracefully — this only feeds optional,
    display-only fields and must never raise into an endpoint response."""
    if not ts:
        return ""
    try:
        s = str(ts).replace("T", " ").split(".")[0].strip()
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return ""
    try:
        secs = (datetime.utcnow() - dt).total_seconds()
    except Exception:
        return ""
    if secs < 0:
        secs = 0
    if secs < 60:
        return "just now"
    mins = int(secs // 60)
    if mins < 60:
        return f"{mins}m ago"
    hours = int(mins // 60)
    if hours < 24:
        return f"{hours}h ago"
    days = int(hours // 24)
    if days < 7:
        return f"{days}d ago"
    weeks = int(days // 7)
    if weeks < 5:
        return f"{weeks}w ago"
    return dt.strftime("%b %d, %Y")


BLOCKED_LANGUAGES = {"hi"}


# Canonical Daily-Goal option values the Profile page can actually render (its
# frontend DAILY_GOALS list is 15/30/60/120 minutes). Legacy rows store
# NON-canonical values — most importantly the `user_settings.daily_goal` schema
# DEFAULT '30min' (main.py), which the onboarding INSERT in
# vaathiyaar/profiler.save_onboarding inherits because it omits daily_goal. So
# essentially every onboarded user has daily_goal='30min' stored, and '30min'
# matches no <option>, leaving the Profile "Daily Goal" dropdown blank/mismatched
# until the user manually re-picks and saves. (Onboarding's own time codes
# '15min'/'1hour'/'weekends' are likewise non-canonical.) We normalise on READ
# so the UI always receives a renderable value; stored data is left untouched
# (no migration, fully reversible, and any non-UI consumer still sees the raw).
_DAILY_GOAL_CANONICAL = {"15", "30", "60", "120"}


def _normalize_daily_goal(raw) -> str:
    """Map any stored daily_goal to the canonical minute set the Profile page
    renders. Idempotent for already-canonical values; interprets hour-ish codes
    ('1hour' -> 60) and minute/bare codes ('30min','45' -> minutes), snaps to the
    nearest allowed option, and falls back to '30' for anything unparseable
    (e.g. 'weekends'). Never raises — display-only field."""
    try:
        if raw is None:
            return "30"
        s = str(raw).strip().lower()
        if s in _DAILY_GOAL_CANONICAL:
            return s
        import re
        m = re.search(r"\d+", s)
        if not m:
            return "30"
        num = int(m.group())
        minutes = num * 60 if "h" in s else num  # '1hour'/'2 hr' -> hours
        allowed = [15, 30, 60, 120]
        best = min(allowed, key=lambda a: abs(a - minutes))
        return str(best)
    except Exception:
        return "30"


# The Profile page's learning-style control renders exactly this set (frontend
# Profile.jsx LEARNING_STYLES: visual/reading/hands_on/mixed). Onboarding, however,
# stores from a DIFFERENT option set (Onboarding.jsx: visual/hands_on/reading/
# 'projects'), so a user who picked "Project-Driven" has learning_style='projects'
# — a value the Profile control cannot render, leaving NO style button highlighted.
_LEARNING_STYLE_CANONICAL = {"visual", "reading", "hands_on", "mixed"}
_LEARNING_STYLE_ALIASES = {
    "projects": "hands_on",      # "Project-Driven" == build things == hands-on
    "project": "hands_on",
    "project_driven": "hands_on",
    "project-driven": "hands_on",
    "kinesthetic": "hands_on",   # defensive: legacy/synonym codes
    "hands-on": "hands_on",
    "handson": "hands_on",
    "balanced": "mixed",
    "mix": "mixed",
    "read": "reading",
    "reading_theory": "reading",
    "visual_diagrams": "visual",
}


def _normalize_learning_style(raw) -> str:
    """Map any stored learning_style to the renderable set the Profile page shows.
    Idempotent for already-canonical values; aliases onboarding-only codes (notably
    'projects' -> 'hands_on'); falls back to 'mixed' (today's null default) for
    anything unrecognised. Never raises — display-only field."""
    try:
        if raw is None:
            return "mixed"
        s = str(raw).strip().lower()
        if not s:
            return "mixed"
        if s in _LEARNING_STYLE_CANONICAL:
            return s
        return _LEARNING_STYLE_ALIASES.get(s, "mixed")
    except Exception:
        return "mixed"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class OnboardingData(BaseModel):
    user_id: str
    motivation: str
    prior_experience: str
    # Optional with a safe default: the current onboarding UI no longer asks a
    # dedicated "languages you already know" question, so the frontend legitimately
    # omits this field. Keeping it required made EVERY individual onboarding submit
    # fail Pydantic validation (422 "field required"), stranding new individual
    # users on the onboarding screen. Defaulting to [] restores the flow while
    # still accepting a list from any (legacy) caller that does send it.
    known_languages: List[str] = []
    learning_style: str
    goal: str
    time_commitment: str
    preferred_language: str
    user_type: Optional[str] = ""
    email: Optional[str] = ""
    whatsapp: Optional[str] = ""
    # Optional social-profile URLs collected by the onboarding "Connect your
    # professional profiles" step. Previously these were NOT declared on the
    # model, so Pydantic silently dropped the frontend's `linkedin_url`/
    # `github_url` and they never reached the DB — even though the users table
    # has the columns and the Profile page + Org member views display them.
    # Declaring them (optional, default "") captures the values without
    # changing behavior for any caller that omits them.
    linkedin_url: Optional[str] = ""
    github_url: Optional[str] = ""


class OrgOnboardingData(BaseModel):
    user_id: str
    preferred_language: str
    org_size: str
    learner_profile: str
    skill_level: str
    learning_focus: str
    structure_preference: str


class SignalData(BaseModel):
    # Identity is derived from the verified JWT in post_signal (`caller`), so the
    # body's user_id is ignored — keep it Optional rather than required so a caller
    # that (correctly) omits it does not get a 422. topic/value are likewise made
    # tolerant: a learning signal with no extra payload is valid, and telemetry
    # (e.g. the fire-and-forget 'profile_updated' signal) must never 422 the call.
    signal_type: str
    user_id: Optional[str] = None
    topic: str = ""
    value: dict = {}
    session_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/onboarding")
def onboarding(data: OnboardingData):
    """
    Save onboarding questionnaire for a user.
    Blocks 'hi' as preferred_language.
    """
    if data.preferred_language.lower() in BLOCKED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Hindi is not supported on PyMasters. Please choose another language.",
        )

    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

    payload = {
        "motivation": data.motivation,
        "prior_experience": data.prior_experience,
        "known_languages": ", ".join(data.known_languages),
        "learning_style": data.learning_style,
        "goal": data.goal,
        "time_commitment": data.time_commitment,
        "preferred_language": data.preferred_language,
        "user_type": data.user_type or "",
        "email": data.email or "",
        "whatsapp": data.whatsapp or "",
        "linkedin_url": data.linkedin_url or "",
        "github_url": data.github_url or "",
    }

    result = save_onboarding(db_path, data.user_id, payload)
    return result


@router.post("/onboarding/org")
def org_onboarding(data: OrgOnboardingData):
    """
    Save org-focused onboarding for an organization admin.
    Stores org profile data and marks the admin's onboarding as complete.
    """
    if data.preferred_language.lower() in BLOCKED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Hindi is not supported on PyMasters. Please choose another language.",
        )

    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # The org PROFILE (size/focus/etc.) is organisation-scoped data that only
        # an admin owns, so we only find + write it for admins. But the caller
        # ALSO needs their OWN onboarding marked complete regardless of role.
        #
        # Previously this endpoint hard-raised 400 "User is not an org admin"
        # whenever the caller wasn't a super_admin/admin. Any org member routed
        # here by the frontend (`isOrg = account_type === 'organization'`) who is
        # NOT an admin — e.g. an invited learner whose account_type is
        # 'organization', or an admin later demoted to member — therefore got a
        # 400 on submit ("Something went wrong…") and was permanently stranded on
        # the onboarding screen, unable to proceed. Completing their onboarding
        # (and simply skipping the admin-only org-profile write) unblocks them
        # while leaving the admin flow byte-for-byte unchanged.
        cursor.execute(
            "SELECT org_id FROM org_members WHERE user_id = ? AND role IN ('super_admin', 'admin') LIMIT 1",
            [data.user_id]
        )
        org_row = cursor.fetchone()
        is_admin = org_row is not None

        if is_admin:
            org_id = org_row["org_id"]
            # Upsert org_profiles (admin-owned org-scoped settings only)
            cursor.execute("""
                INSERT INTO org_profiles (org_id, org_size, learner_profile, skill_level, learning_focus, structure_preference)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (org_id) DO UPDATE SET
                    org_size = excluded.org_size,
                    learner_profile = excluded.learner_profile,
                    skill_level = excluded.skill_level,
                    learning_focus = excluded.learning_focus,
                    structure_preference = excluded.structure_preference
            """, [org_id, data.org_size, data.learner_profile, data.skill_level, data.learning_focus, data.structure_preference])

        # Always: update the caller's preferred_language and mark onboarding complete
        cursor.execute(
            "UPDATE users SET preferred_language = ?, onboarding_completed = 1 WHERE id = ?",
            [data.preferred_language, data.user_id]
        )

        # Also create/update user_profiles entry to mark onboarding_completed
        cursor.execute("""
            INSERT INTO user_profiles (user_id, preferred_language, onboarding_completed)
            VALUES (?, ?, 1)
            ON CONFLICT (user_id) DO UPDATE SET
                preferred_language = excluded.preferred_language,
                onboarding_completed = 1
        """, [data.user_id, data.preferred_language])

        conn.commit()
        # `org_profile_saved` is a new OPTIONAL field (additive) — existing keys
        # (`onboarding_completed`, `user_id`) are unchanged, so any current client
        # that ignores it keeps working exactly as before.
        return {"onboarding_completed": True, "user_id": data.user_id, "org_profile_saved": is_admin}
    finally:
        conn.close()


@router.post("/onboarding/skip")
def skip_onboarding(caller: str = Depends(get_current_user_id)):
    """
    Mark the authenticated user's onboarding as complete WITHOUT the questionnaire.

    Backs the "Skip setup" control on the onboarding screen so the choice is durable
    server-side (survives a fresh login on another device), not just in localStorage.
    Identity comes from the verified JWT (`caller`), never a client-supplied id.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET onboarding_completed = 1 WHERE id = ?", [caller]
        )
        cursor.execute(
            "INSERT INTO user_profiles (user_id, onboarding_completed) VALUES (?, 1) "
            "ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = 1",
            [caller],
        )
        conn.commit()
        return {"onboarding_completed": True, "user_id": caller}
    finally:
        conn.close()


@router.get("/{user_id}")
def get_profile(user_id: str, caller: str = Depends(get_current_user_id)):
    """
    Retrieve the student profile for a given user_id.
    Returns {profile, onboarding_completed}.
    """
    _require_self(user_id, caller)
    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))
    profile = get_student_profile(db_path, user_id)

    # created_at lives on the users row; surface it so the UI can show
    # "Member since …" instead of N/A.
    created_at = None
    try:
        conn = sqlite3.connect(db_path)
        row = conn.execute("SELECT created_at FROM users WHERE id = ?", [user_id]).fetchone()
        conn.close()
        if row:
            created_at = row[0]
    except Exception:
        pass

    if profile is None:
        return {"profile": None, "onboarding_completed": False, "created_at": created_at}

    # Enrich with the editable account fields + preferences the Profile page needs.
    # get_student_profile only returns onboarding fields + name, so without this the
    # Profile page can't load email/whatsapp/bio/social links or voice/learning prefs.
    try:
        ec = _get_conn()
        u = ec.execute(
            "SELECT email, whatsapp, linkedin_url, github_url, twitter_url, website_url, points "
            "FROM users WHERE id = ?", [user_id]
        ).fetchone()
        s = ec.execute(
            "SELECT bio, voice_enabled, voice_speed, voice_name, auto_play_animations, "
            "hint_level, daily_goal, difficulty_preference FROM user_settings WHERE user_id = ?",
            [user_id]
        ).fetchone()
        ec.close()
        if u:
            profile["email"] = u["email"] or ""
            profile["whatsapp"] = u["whatsapp"] or ""
            profile["linkedin_url"] = u["linkedin_url"] or ""
            profile["github_url"] = u["github_url"] or ""
            profile["twitter_url"] = u["twitter_url"] or ""
            profile["website_url"] = u["website_url"] or ""
            profile["points"] = u["points"] or 0
        profile["bio"] = (s["bio"] if (s and s["bio"] is not None) else "")
        profile["preferences"] = {
            "preferred_language": profile.get("preferred_language") or "en",
            "learning_style": _normalize_learning_style(profile.get("learning_style")),
            "daily_goal": _normalize_daily_goal(s["daily_goal"] if (s and s["daily_goal"] is not None) else "30"),
            "difficulty": (s["difficulty_preference"] if (s and s["difficulty_preference"]) else "beginner"),
            "vaathiyaar": {
                "voice_mode": bool(s["voice_enabled"]) if (s and s["voice_enabled"] is not None) else False,
                "voice_speed": (s["voice_speed"] if (s and s["voice_speed"] is not None) else 1.0),
                "voice_selection": (s["voice_name"] if (s and s["voice_name"]) else "default"),
                "auto_play_animations": bool(s["auto_play_animations"]) if (s and s["auto_play_animations"] is not None) else True,
                "hint_level": (s["hint_level"] if (s and s["hint_level"] is not None) else 2),
            },
        }
    except Exception as e:
        print(f"[get_profile] enrich failed: {e!r}")

    return {
        "profile": profile,
        "onboarding_completed": profile.get("onboarding_completed", False),
        "created_at": created_at,
    }


@router.get("/{user_id}/export")
def export_user_data(user_id: str, caller: str = Depends(get_current_user_id)):
    """
    Export all user data as JSON (GDPR-style data export).
    """
    _require_self(user_id, caller)
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        export = {"user": dict(user_row)}

        # Remove sensitive fields
        export["user"].pop("password_hash", None)

        tables_to_export = [
            ("profile", "SELECT * FROM user_profiles WHERE user_id = ?"),
            ("settings", "SELECT * FROM user_settings WHERE user_id = ?"),
            ("mastery", "SELECT * FROM user_mastery WHERE user_id = ?"),
            ("lesson_completions", "SELECT * FROM lesson_completions WHERE user_id = ?"),
            ("learning_signals", "SELECT * FROM learning_signals WHERE user_id = ?"),
            ("streaks", "SELECT * FROM user_streaks WHERE user_id = ?"),
            ("notifications", "SELECT * FROM notifications WHERE user_id = ?"),
            ("org_memberships", "SELECT * FROM org_members WHERE user_id = ?"),
            ("learning_paths", "SELECT * FROM user_learning_paths WHERE user_id = ?"),
            ("challenge_submissions", "SELECT * FROM challenge_submissions WHERE user_id = ?"),
        ]

        for key, query in tables_to_export:
            try:
                cursor.execute(query, [user_id])
                rows = cursor.fetchall()
                export[key] = [dict(r) for r in rows]
            except Exception:
                export[key] = []

        return export
    finally:
        conn.close()


@router.post("/{user_id}/reset")
def reset_progress(user_id: str, caller: str = Depends(get_current_user_id)):
    """
    Reset all learning progress for a user while keeping the account.
    """
    _require_self(user_id, caller)
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE id = ?", [user_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Reset XP
        cursor.execute("UPDATE users SET points = 0 WHERE id = ?", [user_id])

        # Clear progress tables
        progress_tables = [
            ("user_mastery", "user_id"),
            ("lesson_completions", "user_id"),
            ("learning_signals", "user_id"),
            ("user_streaks", "user_id"),
            ("challenge_submissions", "user_id"),
            ("path_adaptation_log", "user_id"),
        ]
        for table, column in progress_tables:
            try:
                cursor.execute(f"DELETE FROM {table} WHERE {column} = ?", [user_id])
            except Exception:
                pass

        # Reset learning path progress
        try:
            cursor.execute(
                "UPDATE user_learning_paths SET status = 'not_started', current_step = 0, progress_pct = 0 WHERE user_id = ?",
                [user_id]
            )
        except Exception:
            pass

        conn.commit()
        return {"reset": True, "user_id": user_id}
    finally:
        conn.close()


@router.delete("/{user_id}")
def delete_account(user_id: str, caller: str = Depends(get_current_user_id)):
    """
    Permanently delete a user account and all associated data.
    This action is irreversible.
    """
    _require_self(user_id, caller)
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists
        cursor.execute("SELECT id FROM users WHERE id = ?", [user_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Guard: don't allow deletion if user is sole super_admin of any org
        cursor.execute("""
            SELECT om.org_id, o.name
            FROM org_members om
            JOIN organizations o ON o.id = om.org_id
            WHERE om.user_id = ? AND om.role = 'super_admin'
        """, [user_id])
        admin_orgs = cursor.fetchall()

        for org in admin_orgs:
            cursor.execute(
                "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND role = 'super_admin' AND user_id != ?",
                [org["org_id"], user_id]
            )
            other_admins = cursor.fetchone()[0]
            if other_admins == 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"You are the only super admin of '{org['name']}'. Transfer ownership or delete the organization first."
                )

        # Delete playground messages FIRST (child rows keyed by conversation_id,
        # not user_id). This must run BEFORE the related_tables loop below
        # deletes playground_conversations, because the subquery resolves the
        # user's conversation ids from that table — deleting parents first
        # left the messages orphaned forever (FKs are not enforced: _get_conn
        # never sets PRAGMA foreign_keys=ON).
        try:
            cursor.execute(
                "DELETE FROM playground_messages WHERE conversation_id IN "
                "(SELECT id FROM playground_conversations WHERE user_id = ?)",
                [user_id]
            )
        except Exception:
            pass

        # Delete from all related tables (all keyed directly by a user-id column)
        related_tables = [
            ("user_profiles", "user_id"),
            ("user_settings", "user_id"),
            ("user_streaks", "user_id"),
            ("user_mastery", "user_id"),
            ("learning_signals", "user_id"),
            ("lesson_completions", "user_id"),
            ("notifications", "user_id"),
            ("notification_deliveries", "user_id"),
            ("notification_preferences", "user_id"),
            ("module_generation_jobs", "user_id"),
            ("generated_lessons", "user_id"),
            ("playground_conversations", "user_id"),
            ("user_learning_paths", "user_id"),
            ("pending_vaathiyaar_messages", "user_id"),
            ("challenge_submissions", "user_id"),
            ("path_adaptation_log", "user_id"),
            ("org_members", "user_id"),
            ("org_invites", "invited_by"),
            ("training_data", "user_id"),
        ]

        for table, column in related_tables:
            try:
                cursor.execute(f"DELETE FROM {table} WHERE {column} = ?", [user_id])
            except Exception:
                pass  # Table may not exist in all environments

        # Finally delete the user record
        cursor.execute("DELETE FROM users WHERE id = ?", [user_id])
        conn.commit()

        return {"deleted": True, "user_id": user_id}
    finally:
        conn.close()


@router.post("/signal")
def post_signal(data: SignalData, caller: str = Depends(get_current_user_id)):
    """
    Record a learning signal for the authenticated user.

    Identity is derived from the verified JWT (`caller`), NEVER from the
    client-supplied `data.user_id`. Previously this endpoint had no auth and
    trusted the body's user_id, so an anonymous caller who enumerated ids from
    the public /api/members directory could inject arbitrary learning signals
    for any user (data-integrity / signal-poisoning). Requiring the token and
    deriving identity from it closes both the anonymous and the cross-user
    paths. All frontend callers (Classroom/Dashboard/Profile/Paths) send their
    own user.id via the authenticated axios instance, so this is non-breaking.
    """
    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

    record_signal(
        db_path,
        user_id=caller,
        signal_type=data.signal_type,
        topic=data.topic,
        value=data.value,
        session_id=data.session_id,
    )

    return {"recorded": True}


# ---------------------------------------------------------------------------
# New Pydantic models for profile management
# ---------------------------------------------------------------------------

class UserSettingsUpdate(BaseModel):
    name: str = ""
    email: str = ""
    whatsapp: str = ""
    bio: str = ""
    preferred_language: str = "en"
    learning_style: str = ""
    daily_goal: str = "30min"
    difficulty_preference: str = "intermediate"
    voice_enabled: bool = False
    voice_speed: float = 1.0
    voice_name: str = ""
    auto_play_animations: bool = True
    hint_level: int = 2
    linkedin_url: Optional[str] = ""
    github_url: Optional[str] = ""
    twitter_url: Optional[str] = ""
    website_url: Optional[str] = ""
    # The frontend sends preferences NESTED ({preferred_language, learning_style,
    # daily_goal, difficulty, vaathiyaar:{voice_mode, voice_speed, voice_selection,
    # auto_play_animations, hint_level}}). Accept that here; the handler prefers
    # nested values and falls back to the flat fields above for backward-compat.
    preferences: dict = {}


# ---------------------------------------------------------------------------
# Helper: get a sqlite3 connection with row_factory
# ---------------------------------------------------------------------------

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# PUT /api/profile/{user_id}/settings
# ---------------------------------------------------------------------------

@router.put("/{user_id}/settings")
def update_user_settings(user_id: str, data: UserSettingsUpdate, caller: str = Depends(get_current_user_id)):
    """
    Update user settings across users, user_profiles, and user_settings tables.
    """
    _require_self(user_id, caller)
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists
        cursor.execute("SELECT id FROM users WHERE id = ?", [user_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Resolve preferences from the NESTED payload the frontend sends, falling
        # back to the flat fields for backward-compatibility.
        prefs = data.preferences or {}
        v = prefs.get("vaathiyaar", {}) or {}
        preferred_language = prefs.get("preferred_language") or data.preferred_language or "en"
        learning_style = prefs.get("learning_style") if prefs.get("learning_style") is not None else data.learning_style
        daily_goal = str(prefs.get("daily_goal") if prefs.get("daily_goal") is not None else data.daily_goal)
        difficulty_preference = prefs.get("difficulty") or data.difficulty_preference or "intermediate"
        voice_enabled = 1 if (v.get("voice_mode") if "voice_mode" in v else data.voice_enabled) else 0
        voice_speed = float(v.get("voice_speed") if v.get("voice_speed") is not None else data.voice_speed)
        voice_name = v.get("voice_selection") if v.get("voice_selection") is not None else data.voice_name
        auto_play_animations = 1 if (v.get("auto_play_animations") if "auto_play_animations" in v else data.auto_play_animations) else 0
        hint_level = int(v.get("hint_level") if v.get("hint_level") is not None else data.hint_level)

        # Only touch columns the caller actually sent. The Profile-page language
        # switcher (and any other narrow caller) PUTs a PARTIAL body such as
        # {"preferred_language": "ta"}; without this guard the unset model
        # defaults ("") would overwrite name/email/whatsapp/bio/social links and
        # reset every learning/voice preference — wiping the whole profile on a
        # simple language change. We distinguish "field omitted" from "field set
        # to ''" via Pydantic's fields-set and, for an existing row, update ONLY
        # the provided columns. A first-time INSERT (no prior data to lose) still
        # writes the resolved values/defaults as before.
        fields_set = getattr(data, "model_fields_set", None)
        if fields_set is None:
            fields_set = getattr(data, "__fields_set__", set())
        has_prefs = "preferences" in fields_set

        def _given(flat_name, prefs_key=None, vaa_key=None):
            if flat_name in fields_set:
                return True
            if has_prefs and prefs_key is not None and prefs_key in prefs:
                return True
            if has_prefs and vaa_key is not None and vaa_key in v:
                return True
            return False

        # 1. Update users table (identity + social links) — provided columns only.
        user_updates = [
            ("name", data.name, "name" in fields_set),
            ("email", data.email, "email" in fields_set),
            ("whatsapp", data.whatsapp, "whatsapp" in fields_set),
            ("linkedin_url", data.linkedin_url or "", "linkedin_url" in fields_set),
            ("github_url", data.github_url or "", "github_url" in fields_set),
            ("twitter_url", data.twitter_url or "", "twitter_url" in fields_set),
            ("website_url", data.website_url or "", "website_url" in fields_set),
        ]
        u_cols = [f"{c} = ?" for c, _val, given in user_updates if given]
        u_vals = [val for _c, val, given in user_updates if given]
        if u_cols:
            cursor.execute(
                f"UPDATE users SET {', '.join(u_cols)} WHERE id = ?",
                u_vals + [user_id],
            )

        # 2. Upsert user_profiles table (learning preferences) — provided columns only.
        # Defence-in-depth: never PERSIST a BLOCKED language (e.g. 'hi'), matching the
        # block already enforced at onboarding (L143/L176) and by /api/languages. A
        # stale/rogue client that still submits a blocked code has its language write
        # SKIPPED (existing stored value preserved) rather than the whole profile save
        # 400-ing — so no legitimate save is ever disrupted. The first-time INSERT path
        # coerces a blocked code to the safe default 'en'.
        lang_blocked = (preferred_language or "").lower() in BLOCKED_LANGUAGES
        lang_given = _given("preferred_language", "preferred_language") and not lang_blocked
        safe_preferred_language = "en" if lang_blocked else preferred_language
        style_given = _given("learning_style", "learning_style")
        cursor.execute("SELECT user_id FROM user_profiles WHERE user_id = ?", [user_id])
        if cursor.fetchone():
            p_cols, p_vals = [], []
            if lang_given:
                p_cols.append("preferred_language = ?")
                p_vals.append(safe_preferred_language)
            if style_given:
                p_cols.append("learning_style = ?")
                p_vals.append(learning_style)
            if p_cols:
                cursor.execute(
                    f"UPDATE user_profiles SET {', '.join(p_cols)} WHERE user_id = ?",
                    p_vals + [user_id],
                )
        else:
            cursor.execute(
                """INSERT INTO user_profiles (user_id, preferred_language, learning_style, onboarding_completed)
                   VALUES (?, ?, ?, 1)""",
                [user_id, safe_preferred_language, learning_style],
            )

        # 3. Upsert user_settings table (bio + voice/animation/misc) — provided columns only.
        settings_updates = [
            ("bio", data.bio, "bio" in fields_set),
            ("voice_enabled", voice_enabled, _given("voice_enabled", vaa_key="voice_mode")),
            ("voice_speed", voice_speed, _given("voice_speed", vaa_key="voice_speed")),
            ("voice_name", voice_name, _given("voice_name", vaa_key="voice_selection")),
            ("auto_play_animations", auto_play_animations, _given("auto_play_animations", vaa_key="auto_play_animations")),
            ("hint_level", hint_level, _given("hint_level", vaa_key="hint_level")),
            ("daily_goal", daily_goal, _given("daily_goal", "daily_goal")),
            ("difficulty_preference", difficulty_preference, _given("difficulty_preference", "difficulty")),
        ]
        cursor.execute("SELECT user_id FROM user_settings WHERE user_id = ?", [user_id])
        if cursor.fetchone():
            s_cols = [f"{c} = ?" for c, _val, given in settings_updates if given]
            s_vals = [val for _c, val, given in settings_updates if given]
            if s_cols:
                s_cols.append("updated_at = CURRENT_TIMESTAMP")
                cursor.execute(
                    f"UPDATE user_settings SET {', '.join(s_cols)} WHERE user_id = ?",
                    s_vals + [user_id],
                )
        else:
            cursor.execute(
                """INSERT INTO user_settings
                   (user_id, bio, voice_enabled, voice_speed, voice_name,
                    auto_play_animations, hint_level, daily_goal, difficulty_preference, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                [
                    user_id, data.bio, voice_enabled, voice_speed,
                    voice_name, auto_play_animations, hint_level,
                    daily_goal, difficulty_preference,
                ],
            )

        conn.commit()
        return {"updated": True}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/profile/{user_id}/stats
# ---------------------------------------------------------------------------

@router.get("/{user_id}/stats")
def get_user_stats(user_id: str, caller: str = Depends(get_current_user_id)):
    """
    Return aggregated statistics for a user.
    """
    _require_self(user_id, caller)
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists and get XP
        cursor.execute("SELECT id, points FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        total_xp = user_row["points"] or 0

        # Modules completed (distinct topics with mastery_level >= 0.5)
        cursor.execute(
            "SELECT COUNT(DISTINCT topic) FROM user_mastery WHERE user_id = ? AND mastery_level >= 0.5",
            [user_id],
        )
        modules_completed = cursor.fetchone()[0] or 0

        # Lessons completed
        cursor.execute(
            "SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        lessons_completed = cursor.fetchone()[0] or 0

        # Current streak from user_streaks table.
        # The stored current_streak is only rewritten by touch_streak when the
        # user does an activity, so it decays silently: a lapsed streak stays at
        # its old value (e.g. 7) in the row until the next activity resets it to
        # 1. Reading it raw makes the Dashboard "day streak" badge OVER-REPORT a
        # broken streak. Correct at read time via effective_current_streak, which
        # applies the same today/yesterday lapse rule touch_streak uses on write
        # (0 once there's a 2+-day gap) WITHOUT mutating stored data. For a live
        # streak (last activity today/yesterday) the value is byte-identical to
        # before, so active users are unaffected.
        current_streak = 0
        cursor.execute(
            "SELECT current_streak, last_active_date FROM user_streaks WHERE user_id = ?",
            [user_id],
        )
        streak_row = cursor.fetchone()
        if streak_row:
            from streaks import effective_current_streak
            current_streak = effective_current_streak(
                streak_row["current_streak"], streak_row["last_active_date"]
            )

        # Total time from learning_signals (sum of time_spent signals)
        total_time_minutes = 0
        cursor.execute(
            "SELECT value FROM learning_signals WHERE user_id = ? AND signal_type = 'time_spent'",
            [user_id],
        )
        for row in cursor.fetchall():
            try:
                import json
                val = json.loads(row["value"]) if isinstance(row["value"], str) else row["value"]
                if isinstance(val, dict):
                    total_time_minutes += val.get("seconds", 0) / 60
                elif isinstance(val, (int, float)):
                    total_time_minutes += val / 60
            except Exception:
                pass

        total_time_minutes = round(total_time_minutes)

        # Recent activity feed (most recent lesson/module completions). The
        # Dashboard "Recent Activity" panel reads `stats.recent_activity`; this
        # field was never returned, so the panel always fell back to its empty
        # state ("Start learning to see your activity here") even for users with
        # real completions. Building it from lesson_completions (which IS written
        # on every module/challenge pass) makes the panel populate. Additive and
        # optional: if the query yields nothing the field is [] and the UI shows
        # the same empty state as before — zero change for existing behavior.
        recent_activity = []
        try:
            cursor.execute(
                "SELECT lesson_id, completed_at, xp_awarded FROM lesson_completions "
                "WHERE user_id = ? ORDER BY completed_at DESC LIMIT 5",
                [user_id],
            )
            comp_rows = cursor.fetchall()
            # Resolve friendly titles for any generated lessons in one batch query;
            # static modules fall back to a de-slugged id ('module_1' -> 'Module 1').
            gen_titles = {}
            if comp_rows:
                ids = [r["lesson_id"] for r in comp_rows]
                placeholders = ",".join("?" for _ in ids)
                cursor.execute(
                    f"SELECT id, topic FROM generated_lessons WHERE id IN ({placeholders})",
                    ids,
                )
                gen_titles = {gr["id"]: gr["topic"] for gr in cursor.fetchall()}
            for r in comp_rows:
                lid = r["lesson_id"]
                title = gen_titles.get(lid) or str(lid).replace("_", " ").title()
                recent_activity.append({
                    "label": f"Completed {title}",
                    "time": _relative_time(r["completed_at"]),
                    "xp": r["xp_awarded"] or 0,
                })
        except Exception:
            recent_activity = []

        # Rank based on XP
        if total_xp >= 1000:
            rank = "Code Architect"
        elif total_xp >= 500:
            rank = "Python Warrior"
        elif total_xp >= 100:
            rank = "Rising Star"
        elif total_xp >= 50:
            rank = "Apprentice"
        else:
            rank = "Beginner"

        return {
            "total_xp": total_xp,
            "modules_completed": modules_completed,
            "current_streak": current_streak,
            "total_time_minutes": total_time_minutes,
            "lessons_completed": lessons_completed,
            "rank": rank,
            "recent_activity": recent_activity,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/profile/{user_id}/achievements
# ---------------------------------------------------------------------------

ACHIEVEMENT_DEFINITIONS = [
    {
        "id": "first_login",
        "name": "First Steps",
        "description": "Welcome to PyMasters! You took the first step.",
        "icon": "footprints",
    },
    {
        "id": "first_module",
        "name": "Knowledge Seeker",
        "description": "Completed your first module.",
        "icon": "book-open",
    },
    {
        "id": "streak_7",
        "name": "Consistent Learner",
        "description": "Maintained a 7-day learning streak.",
        "icon": "flame",
    },
    {
        "id": "xp_100",
        "name": "Rising Star",
        "description": "Earned 100 or more XP.",
        "icon": "star",
    },
    {
        "id": "xp_500",
        "name": "Python Warrior",
        "description": "Earned 500 or more XP.",
        "icon": "sword",
    },
    {
        "id": "xp_1000",
        "name": "Code Architect",
        "description": "Earned 1000 or more XP. True mastery!",
        "icon": "trophy",
    },
]


@router.get("/{user_id}/achievements")
def get_user_achievements(user_id: str, caller: str = Depends(get_current_user_id)):
    """
    Return achievement list with earned status for a user.
    """
    _require_self(user_id, caller)
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists
        cursor.execute("SELECT id, points, created_at FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        total_xp = user_row["points"] or 0
        user_created = user_row["created_at"]

        # Lessons completed count
        cursor.execute(
            "SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        lessons_done = cursor.fetchone()[0] or 0

        # First lesson completion date
        cursor.execute(
            "SELECT MIN(completed_at) FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        first_completion_row = cursor.fetchone()
        first_completion_at = first_completion_row[0] if first_completion_row else None

        # Current streak (live value) plus the monotonic best-ever streak.
        # longest_streak never decreases (touch_streak keeps it as a running max),
        # so it is the correct basis for a PERMANENT streak achievement; current_streak
        # resets to 1 after a missed day and would revoke an already-earned badge.
        current_streak = 0
        longest_streak = 0
        cursor.execute(
            "SELECT current_streak, longest_streak FROM user_streaks WHERE user_id = ?",
            [user_id],
        )
        streak_row = cursor.fetchone()
        if streak_row:
            current_streak = streak_row["current_streak"] or 0
            longest_streak = streak_row["longest_streak"] or 0

        # Build achievements
        results = []
        for defn in ACHIEVEMENT_DEFINITIONS:
            earned = False
            earned_at = None

            if defn["id"] == "first_login":
                earned = True
                earned_at = user_created

            elif defn["id"] == "first_module":
                if lessons_done > 0:
                    earned = True
                    earned_at = first_completion_at

            elif defn["id"] == "streak_7":
                # Earned once the user has EVER reached a 7-day streak. Gate on the
                # monotonic best-ever streak (falling back to the live value
                # defensively) so a single missed day — which resets current_streak
                # to 1 — no longer silently REVOKES an already-earned badge.
                if max(longest_streak, current_streak) >= 7:
                    earned = True
                    earned_at = None  # no exact timestamp available

            elif defn["id"] == "xp_100":
                earned = total_xp >= 100
            elif defn["id"] == "xp_500":
                earned = total_xp >= 500
            elif defn["id"] == "xp_1000":
                earned = total_xp >= 1000

            results.append({
                "id": defn["id"],
                "name": defn["name"],
                "description": defn["description"],
                "icon": defn["icon"],
                "earned": earned,
                "earned_at": earned_at,
            })

        return results
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/profile/{user_id}/daily-recommendation
# ---------------------------------------------------------------------------

DAILY_TIPS = [
    "Use f-strings for cleaner string formatting: f'Hello {name}'",
    "List comprehensions are faster and more Pythonic than manual loops.",
    "Use 'enumerate()' instead of range(len()) when you need both index and value.",
    "The 'zip()' function pairs elements from multiple iterables elegantly.",
    "Dictionary .get(key, default) avoids KeyError exceptions.",
    "Use 'with' statements for file handling to ensure proper cleanup.",
    "The 'collections' module has powerful data structures like Counter and defaultdict.",
    "Type hints make your code self-documenting: def greet(name: str) -> str",
    "Virtual environments keep your project dependencies isolated.",
    "Write docstrings for your functions — your future self will thank you.",
]

TRENDING_TOPICS = [
    "Pattern Matching (match/case) in Python 3.10+",
    "Building REST APIs with FastAPI",
    "Data Analysis with pandas",
    "Async programming with asyncio",
    "Type hints and mypy for safer code",
    "Web scraping with BeautifulSoup",
    "Testing with pytest",
    "Working with JSON and APIs",
]


@router.get("/{user_id}/daily-recommendation")
def get_daily_recommendation(user_id: str, caller: str = Depends(get_current_user_id)):
    """
    Return a personalized daily recommendation for the user.
    """
    _require_self(user_id, caller)
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Get user info
        cursor.execute("SELECT id, name, username, points FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        display_name = user_row["name"] or user_row["username"] or "Learner"
        total_xp = user_row["points"] or 0

        # Determine time-of-day greeting
        hour = datetime.now().hour
        if hour < 12:
            time_greeting = "Good morning"
        elif hour < 17:
            time_greeting = "Good afternoon"
        else:
            time_greeting = "Good evening"

        greeting = f"{time_greeting}, {display_name}!"

        # Find the next uncompleted lesson to recommend
        cursor.execute(
            "SELECT lesson_id FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        completed_ids = {row["lesson_id"] for row in cursor.fetchall()}

        # Check generated lessons for the user
        recommended_lesson = None
        reason = "Keep building your Python skills!"
        # Additive presentation fields for the Dashboard "Today's Recommended
        # Lesson" card. The card reads recommendation.title /
        # recommended_lesson?.title / .description / .link, but the response only
        # ever carried `recommended_lesson` as a plain string, so the headline
        # always fell back to the generic "Continue in the Classroom" and the CTA
        # always went to /dashboard/classroom — the actual recommendation was
        # never surfaced. These optional fields make the existing (?.- and
        # ||-guarded) frontend reads resolve to real values. `recommended_lesson`
        # itself is unchanged for backward compatibility.
        rec_title = None
        rec_description = None
        rec_link = "/dashboard/classroom"

        cursor.execute(
            "SELECT id, topic FROM generated_lessons WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
            [user_id],
        )
        gen_lessons = cursor.fetchall()
        for gl in gen_lessons:
            if gl["id"] not in completed_ids:
                recommended_lesson = gl["topic"]
                reason = "This lesson was crafted just for you based on your learning profile."
                rec_title = gl["topic"]
                rec_description = "A lesson tailored to your learning profile — pick up where you left off."
                rec_link = "/dashboard/classroom"
                break

        # Fallback to static modules
        if not recommended_lesson:
            # Friendly titles/descriptions for the four stable seed modules
            # (mirrors CONTENT_MAP in main.py). /dashboard/learn/<id> currently
            # redirects to /dashboard/classroom, so we link straight to the
            # classroom to avoid a redirect bounce.
            module_meta = {
                "module_1": ("Python Basics: Variables & Types", "Master the atoms of Python: strings, integers, and floats."),
                "module_2": ("Control Flow: If & Loops", "Learn how to direct the flow of your program."),
                "module_3": ("Data Structures: Lists & Dicts", "Store and organize data efficiently."),
                "module_4": ("Advanced: Async & APIs", "Modern Python concurrency and networking."),
            }
            for mid in ["module_1", "module_2", "module_3", "module_4"]:
                if mid not in completed_ids:
                    recommended_lesson = mid
                    reason = "Continue your learning journey with the next module."
                    meta = module_meta.get(mid)
                    rec_title = meta[0] if meta else mid.replace("_", " ").title()
                    rec_description = meta[1] if meta else "Continue your learning journey."
                    rec_link = "/dashboard/classroom"
                    break

        if not recommended_lesson:
            recommended_lesson = "Explore the Playground"
            reason = "You have completed all available modules! Try the Playground to practice."
            rec_title = "Explore the Playground"
            rec_description = "You've completed every module — flex your skills in the live Playground."
            rec_link = "/dashboard/playground"

        # Seeded random for daily consistency
        today_seed = date.today().toordinal() + hash(user_id) % 10000
        rng = random.Random(today_seed)

        daily_tip = rng.choice(DAILY_TIPS)
        trending_topic = rng.choice(TRENDING_TOPICS)

        return {
            "greeting": greeting,
            "recommended_lesson": recommended_lesson,
            "reason": reason,
            "trending_topic": trending_topic,
            "daily_tip": daily_tip,
            # Additive presentation fields (see note above) — optional; older
            # clients ignore them, current Dashboard consumes them via guarded reads.
            "title": rec_title,
            "description": rec_description,
            "link": rec_link,
        }
    finally:
        conn.close()
