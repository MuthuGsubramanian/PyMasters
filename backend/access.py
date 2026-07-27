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

# "student" is the free 3-month plan granted through the homepage support flow
# (student-ID verification). It is assigned-only — payments.py sells only the
# plans in its own PLAN_PRICING — but for access purposes it behaves like any
# other admin-assigned, time-boxed plan.
PAID_PLANS = {"beginner", "pro", "enterprise", "student"}

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
    # Super admins and grandfathered orgs keep the enterprise catalog. For any
    # other entitlement, enterprise tracks require an actual 'enterprise' plan —
    # a self-created org (or a pro/beginner plan) does NOT unlock them. The
    # degraded fallback withholds enterprise by omission (fail-safe).
    if reason in ("super_admin", "organization_grandfathered"):
        return True
    if reason in ("organization_plan", "assigned_plan") and status.get("plan") == "enterprise":
        return True
    return False


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

        # Org entitlement (request-gated policy, 2026-07-27, supersedes the
        # 2026-07-02 "any org member is entitled" rule). Bare org_members
        # membership no longer grants access — a self-created org must be granted
        # a plan by the platform admin. Entitlement now comes from the member's
        # org(s): grandfathered orgs (every org that existed at migration time)
        # keep full access forever; otherwise the org needs an unexpired PAID
        # plan, and enterprise TRACKS additionally require that plan to be
        # 'enterprise'. Result: ("grandfathered",None) | ("plan",best) |
        # ("degraded",None) | None (member but not entitled → falls to trial).
        org_entitlement = None
        try:
            org_rows = conn.execute(
                "SELECT COALESCE(o.grandfathered,0) AS g, COALESCE(o.plan,'free') AS plan, "
                "o.plan_expires_at AS exp FROM org_members om "
                "JOIN organizations o ON o.id = om.org_id WHERE om.user_id = ?",
                [user_id],
            ).fetchall()
            if org_rows:
                if any(int(r["g"] or 0) == 1 for r in org_rows):
                    org_entitlement = ("grandfathered", None)
                else:
                    best = None
                    for r in org_rows:
                        p = r["plan"]
                        if p in PAID_PLANS:
                            exp = _parse_dt(r["exp"])
                            if exp is None or exp > datetime.utcnow():
                                if p == "enterprise":
                                    best = "enterprise"
                                    break
                                best = best or p
                    if best:
                        org_entitlement = ("plan", best)
        except Exception:
            # organizations table/columns absent (lagging replica or a minimal
            # test fixture). Fail OPEN for basic access — an org member keeps
            # learning — but withhold enterprise on this degraded path.
            m = conn.execute(
                "SELECT 1 FROM org_members WHERE user_id = ? LIMIT 1", [user_id]
            ).fetchone()
            if m:
                org_entitlement = ("degraded", None)

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

    # Org-derived entitlement (see the org_entitlement computation above).
    if org_entitlement is not None:
        kind, org_plan = org_entitlement
        if kind == "grandfathered":
            return {"status": "active", "plan": u["plan"], "reason": "organization_grandfathered"}
        if kind == "plan":
            return {"status": "active", "plan": org_plan, "reason": "organization_plan"}
        if kind == "degraded":
            return {"status": "active", "plan": u["plan"], "reason": "organization_degraded"}
    # NOTE: an org member with no entitlement (self-created org, no plan) is NOT
    # granted here — they fall through to the individual trial/assigned-plan
    # rules below until the platform admin approves a plan for their org.

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
