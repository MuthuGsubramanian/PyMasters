"""
access.py — trial/plan access resolution for PyMasters.

Policy (set by MSG, 2026-07-02):
  * INDIVIDUAL users get a 7-day full-access trial from signup; after that,
    learning features are gated until a plan is assigned.
  * Everyone else is exempt: org members / org accounts (their access is the
    org's commercial relationship), super admins, and any user whose plan was
    manually assigned by a super admin (until its plan_expires_at, if any).
  * All other controls stay with the super admin: the /api/admin plan
    endpoints (plan + optional expiry) override the trial entirely.

Grandfathering: accounts created before FEATURE_EPOCH get their 7 days from
FEATURE_EPOCH, not signup — enforcing retroactively would hard-lock every
existing user the minute this deploys.
"""

import os
import sqlite3
from datetime import datetime, timedelta

TRIAL_DAYS = 7
# The day trial enforcement first shipped; do not backdate.
FEATURE_EPOCH = datetime(2026, 7, 2)

PAID_PLANS = {"beginner", "pro", "enterprise"}

# Tracks reserved for organization/enterprise users (MSG, 2026-07-02):
# cloud + enterprise-AI curriculum is a B2B differentiator, hidden from
# individual accounts. Entitled: org members, organization accounts,
# super admins, and users on an (unexpired) enterprise plan.
ENTERPRISE_TRACKS = frozenset({
    "azure_enterprise",
    "azure_ai_foundry",
    "aws_enterprise",
    "gcp_vertex_ai",
    "cross_cloud_architecture",
    "frontier_ai_platforms",
})


def has_enterprise_access(db_path: str, user_id: str | None) -> bool:
    """True when the user may see/open enterprise-only tracks.

    Unlike general learning access (fail-open), this fails CLOSED: on lookup
    errors or anonymous requests the enterprise catalog stays hidden — wrongly
    hiding a track is recoverable; leaking paid B2B content is not.
    """
    if not user_id:
        return False
    status = get_access_status(db_path, user_id)
    reason = status.get("reason", "")
    if reason in ("super_admin", "organization"):
        return True
    return reason == "assigned_plan" and status.get("plan") == "enterprise"


def _break_glass_idents() -> set:
    """The same env-driven super-admin allowlist the admin API honors.

    Why: require_super_admin() (routes/admin.py) grants full console access to
    break-glass emails even when users.is_super_admin=0, but this module only
    checked the DB flag — so the OWNER had every admin power yet still saw a
    trial-countdown chip and could in principle hit trial gates (found by MSG
    2026-07-02). Lazy import avoids any import-order coupling.
    """
    try:
        from routes.admin import SUPER_ADMINS
        return SUPER_ADMINS
    except Exception:
        return {
            e.strip().lower()
            for e in os.getenv("SUPER_ADMIN_EMAILS", "").split(",")
            if e.strip()
        }


def _parse_dt(value):
    if not value:
        return None
    s = str(value).strip().replace("T", " ").replace("Z", "")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.split("+")[0].strip(), fmt)
        except ValueError:
            continue
    return None


def get_access_status(db_path: str, user_id: str) -> dict:
    """Resolve a user's access. Fail-open on any lookup error — a bug in
    billing code must never lock a learner out of a live product."""
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        u = conn.execute(
            "SELECT created_at, COALESCE(plan,'free') AS plan, plan_expires_at, "
            "COALESCE(account_type,'individual') AS account_type, "
            "COALESCE(is_super_admin,0) AS is_super_admin "
            "FROM users WHERE id = ?",
            [user_id],
        ).fetchone()
        if u is None:
            conn.close()
            return {"status": "active", "plan": "free", "reason": "unknown_user"}

        is_org_member = conn.execute(
            "SELECT 1 FROM org_members WHERE user_id = ? LIMIT 1", [user_id]
        ).fetchone() is not None

        # Break-glass identity (nested try: some test fixtures create a users
        # table without username/email — behave exactly as before for them).
        idents = set()
        try:
            r = conn.execute(
                "SELECT username, email FROM users WHERE id = ?", [user_id]
            ).fetchone()
            if r:
                idents = {(r[0] or "").lower(), (r[1] or "").lower()}
        except Exception:
            pass
        conn.close()
    except Exception:
        return {"status": "active", "plan": "free", "reason": "lookup_error"}

    now = datetime.utcnow()

    # DB flag OR env break-glass allowlist — consistent with the admin API's
    # require_super_admin(); an owner-level account must never look "on trial".
    if int(u["is_super_admin"] or 0) == 1 or (idents & _break_glass_idents()):
        return {"status": "active", "plan": u["plan"], "reason": "super_admin"}

    if is_org_member or u["account_type"] != "individual":
        return {"status": "active", "plan": u["plan"], "reason": "organization"}

    # Super-admin-assigned paid plan (optionally time-boxed).
    if u["plan"] in PAID_PLANS:
        expires = _parse_dt(u["plan_expires_at"])
        if expires is None or expires > now:
            return {
                "status": "active",
                "plan": u["plan"],
                "reason": "assigned_plan",
                "plan_expires_at": u["plan_expires_at"],
            }
        # Assigned plan lapsed → fall through to trial rules.

    trial_start = _parse_dt(u["created_at"]) or now
    if trial_start < FEATURE_EPOCH:
        trial_start = FEATURE_EPOCH
    trial_ends = trial_start + timedelta(days=TRIAL_DAYS)

    if now < trial_ends:
        return {
            "status": "trial",
            "plan": u["plan"],
            "trial_days_left": max(0, (trial_ends - now).days),
            "trial_ends_at": trial_ends.strftime("%Y-%m-%d %H:%M:%S"),
        }

    return {
        "status": "expired",
        "plan": u["plan"],
        "trial_ended_at": trial_ends.strftime("%Y-%m-%d %H:%M:%S"),
    }


def assert_learning_access(db_path: str, user_id: str) -> None:
    """Dependency-style guard for learning endpoints. Raises 402 when the
    individual trial has lapsed and no plan is assigned."""
    from fastapi import HTTPException

    status = get_access_status(db_path, user_id)
    if status["status"] == "expired":
        raise HTTPException(
            status_code=402,
            detail="Your 7-day free trial has ended. Choose a plan to keep learning.",
        )
