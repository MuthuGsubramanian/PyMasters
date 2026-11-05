"""
telemetry.py — lightweight product telemetry for the Super Admin console.
Prefix: /api/track (public pings) — admin read/report endpoints live in admin.py.

Requested by MSG (2026-07-02): the Super Admin console should show ops
activity (LinkedIn/YouTube posts done today, etc.), how many users are online
right now, total site visits, and where each user last logged in from.

Design notes:
  * Presence = users.last_seen_at updated by a heartbeat from Layout.jsx
    (page load + every 3 minutes). "Online now" = last_seen within 5 minutes.
  * Visits are an append-only log (tiny at current scale; one row per page
    LOAD, not per heartbeat, so growth is bounded by real traffic).
  * Login geolocation is coarse (country, plus region/city when present) and comes
    from Cloudflare's request headers — no visitor IP is sent to any third party.
    Missing headers just leave the location columns NULL. No precise location is collected.
  * Ops activity rows are reported by the automation loops through a
    super-admin-authenticated endpoint (see admin.py) and rendered on the
    Overview tab.
"""

import os
import sqlite3
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Request

from auth import optional_user_id
from ratelimit import SlidingWindowRateLimiter
from pydantic import BaseModel

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/track", tags=["telemetry"])

# Self-heal: boot-time table creation can lose a race with Litestream's DB
# lock (seen in prod 2026-07-02). Every write path calls _ensure_once() so the
# schema materializes on first use even when the boot migration was skipped.
_ensured = False


def _ensure_once():
    global _ensured
    if _ensured:
        return
    try:
        ensure_telemetry_tables(DB_PATH)
        _ensured = True
    except Exception as exc:  # keep trying on later calls
        print(f"[telemetry.ensure_once] deferred: {exc!r}")


def ensure_telemetry_tables(db_path: str = None):
    conn = sqlite3.connect(db_path or DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS site_visits (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_site_visits_time ON site_visits(created_at)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS login_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                ip TEXT,
                country TEXT,
                region TEXT,
                city TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ops_activity (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,          -- linkedin | youtube | daily-analysis | pilot-loop | ...
                title TEXT NOT NULL,
                url TEXT,
                status TEXT DEFAULT 'done',    -- done | failed | skipped
                detail TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ops_activity_time ON ops_activity(created_at)")
        # Presence column on users (SQLite: ALTER is cheap; ignore if present).
        try:
            conn.execute("ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMP")
        except sqlite3.OperationalError:
            pass  # column already exists
        conn.commit()
    finally:
        conn.close()


def client_ip(request: Request) -> Optional[str]:
    """First hop of X-Forwarded-For (Cloud Run appends the client IP there)."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def _is_private(ip: str) -> bool:
    try:
        import ipaddress
        return ipaddress.ip_address(ip).is_private or ipaddress.ip_address(ip).is_loopback
    except Exception:
        return True


def _cloudflare_geo(request) -> tuple:
    """Coarse geo from Cloudflare's request headers (security review L14, 2026-11-05: the visitor IP used to
    go to ip-api.com over plain HTTP). CF-IPCountry is always set behind Cloudflare; region and city appear when
    the zone's visitor location headers are on. XX = unknown, T1 = Tor: stored as unknown."""
    h = getattr(request, "headers", None) or {}
    country = (h.get("cf-ipcountry") or "").strip().upper()[:2] or None
    if country in ("XX", "T1"):
        return None, None, None
    region = (h.get("cf-region") or "").strip()[:80] or None
    city = (h.get("cf-ipcity") or "").strip()[:80] or None
    return (country, region, city) if country else (None, None, None)


def record_login(user_id: str, request: Optional[Request], db_path: str = None):
    """Called from the login/signup endpoints. Never raises; never blocks on
    the network — geo resolution happens in a daemon thread. `request` may be
    None (direct unit-test calls) — the event is then recorded without an IP."""
    db = db_path or DB_PATH
    if db_path is None:
        _ensure_once()
    try:
        ip = client_ip(request) if request is not None else None
        login_id = str(uuid.uuid4())
        conn = sqlite3.connect(db)
        country, region, city = _cloudflare_geo(request) if request is not None else (None, None, None)
        conn.execute(
            "INSERT INTO login_events (id, user_id, ip, country, region, city) VALUES (?, ?, ?, ?, ?, ?)",
            [login_id, user_id, ip, country, region, city],
        )
        conn.execute(
            "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?", [user_id]
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        print(f"[telemetry.record_login] non-fatal: {exc!r}")


class VisitPing(BaseModel):
    user_id: Optional[str] = None
    path: Optional[str] = None


# Security fix 2026-11-02: these endpoints trusted a body user_id without auth (anyone could mark any
# account "active" - defeating the idle-account lifecycle - and grow site_visits unboundedly). The user
# now comes ONLY from the verified JWT (optional: anonymous visits still count) and calls are IP-limited.
_telemetry_ip_limiter = SlidingWindowRateLimiter(max_calls=60, window_seconds=60)


def _telemetry_allowed(request: Request) -> bool:
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))
    return _telemetry_ip_limiter.allow(ip)


@router.post("/visit")
def track_visit(ping: VisitPing, request: Request, caller: Optional[str] = Depends(optional_user_id)):
    """One row per real page load (Layout mount). Anonymous visits count too."""
    if not _telemetry_allowed(request):
        return {"ok": False}
    ping.user_id = caller
    _ensure_once()
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO site_visits (id, user_id, path) VALUES (?, ?, ?)",
            [str(uuid.uuid4()), ping.user_id, (ping.path or "")[:200]],
        )
        if ping.user_id:
            conn.execute(
                "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
                [ping.user_id],
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        print(f"[telemetry.visit] non-fatal: {exc!r}")
    return {"ok": True}


@router.post("/ping")
def track_ping(ping: VisitPing, request: Request, caller: Optional[str] = Depends(optional_user_id)):
    """Heartbeat (every ~3 min while the app is open). Updates presence only —
    no visit row, so the visits log reflects real page loads."""
    if not _telemetry_allowed(request):
        return {"ok": False}
    ping.user_id = caller
    _ensure_once()
    try:
        if ping.user_id:
            conn = sqlite3.connect(DB_PATH)
            conn.execute(
                "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
                [ping.user_id],
            )
            conn.commit()
            conn.close()
    except Exception as exc:
        print(f"[telemetry.ping] non-fatal: {exc!r}")
    return {"ok": True}
