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
  * Login geolocation is coarse (country/region/city) via a best-effort
    ip-api lookup in a BACKGROUND THREAD — login latency is never affected,
    and any failure just leaves the location columns NULL. Private/loopback
    IPs are skipped. IP + coarse geo only; no precise location is collected.
  * Ops activity rows are reported by the automation loops through a
    super-admin-authenticated endpoint (see admin.py) and rendered on the
    Overview tab.
"""

import os
import sqlite3
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, Request
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


def _geo_lookup_and_store(login_id: str, ip: str, db_path: str):
    """Background: coarse geo for a login row. Best-effort, fail-silent."""
    country = region = city = None
    try:
        import requests
        r = requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city",
            timeout=2.5,
        )
        d = r.json()
        if d.get("status") == "success":
            country, region, city = d.get("country"), d.get("regionName"), d.get("city")
    except Exception:
        pass
    if not country:
        return
    try:
        conn = sqlite3.connect(db_path)
        conn.execute(
            "UPDATE login_events SET country=?, region=?, city=? WHERE id=?",
            [country, region, city, login_id],
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


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
        conn.execute(
            "INSERT INTO login_events (id, user_id, ip) VALUES (?, ?, ?)",
            [login_id, user_id, ip],
        )
        conn.execute(
            "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?", [user_id]
        )
        conn.commit()
        conn.close()
        if ip and not _is_private(ip):
            threading.Thread(
                target=_geo_lookup_and_store, args=(login_id, ip, db), daemon=True
            ).start()
    except Exception as exc:
        print(f"[telemetry.record_login] non-fatal: {exc!r}")


class VisitPing(BaseModel):
    user_id: Optional[str] = None
    path: Optional[str] = None


@router.post("/visit")
def track_visit(ping: VisitPing):
    """One row per real page load (Layout mount). Anonymous visits count too."""
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
def track_ping(ping: VisitPing):
    """Heartbeat (every ~3 min while the app is open). Updates presence only —
    no visit row, so the visits log reflects real page loads."""
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
