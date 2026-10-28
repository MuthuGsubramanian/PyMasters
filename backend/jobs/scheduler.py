"""In-process job scheduler.

A daemon thread ticks once a minute. Each job declares a cadence (`daily` at an HH:MM UTC, or
`weekly` on given weekdays at HH:MM UTC); a run is recorded in `job_runs` keyed by job name and
window (the date), so container restarts never run a job twice and the admin console can show
what ran and how it went. Enabled on the VM with PYMASTERS_JOBS=1 (never in tests or dev by
default).
"""
import json
import os
import sqlite3
import threading
import time
import traceback
from datetime import datetime

JOBS = {}          # name -> {"every": "daily"|"weekly", "at_utc": "HH:MM", "days": [0..6], "run": callable(db_path) -> dict}
_thread = None


def ensure_tables(conn) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS job_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, window TEXT NOT NULL,"
                 " status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, result TEXT, UNIQUE(job, window))")
    conn.commit()


def register(name: str, run, every: str = "daily", at_utc: str = "03:00", days=None) -> None:
    JOBS[name] = {"every": every, "at_utc": at_utc, "days": list(days or []), "run": run}


def _due(spec: dict, now: datetime) -> str | None:
    """Return the window key when the job is due at `now`, else None."""
    hh, mm = (int(x) for x in spec.get("at_utc", "03:00").split(":"))
    if (now.hour, now.minute) < (hh, mm):
        return None
    if spec.get("every") == "weekly" and spec.get("days") and now.weekday() not in spec["days"]:
        return None
    return now.strftime("%Y-%m-%d")


def tick(db_path: str, now: datetime | None = None) -> list:
    """Run every due job that has not run in its window yet. Returns the names that ran."""
    now = now or datetime.utcnow()
    ran = []
    conn = sqlite3.connect(db_path)
    try:
        ensure_tables(conn)
        for name, spec in list(JOBS.items()):
            window = _due(spec, now)
            if not window:
                continue
            try:
                cur = conn.execute("INSERT OR IGNORE INTO job_runs (job, window, status, started_at) VALUES (?, ?, 'running', ?)",
                                   [name, window, now.strftime("%Y-%m-%d %H:%M:%S")])
                conn.commit()
            except sqlite3.Error:
                continue
            if cur.rowcount == 0:
                continue                      # already ran (or running) in this window
            status, result = "ok", None
            try:
                result = spec["run"](db_path)
            except Exception as exc:  # noqa: BLE001 — a failing job must never take the scheduler down
                status, result = "error", {"error": str(exc)[:500], "trace": traceback.format_exc()[-1500:]}
            conn.execute("UPDATE job_runs SET status = ?, finished_at = ?, result = ? WHERE job = ? AND window = ?",
                         [status, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), json.dumps(result, default=str)[:20000], name, window])
            conn.commit()
            print(f"[jobs] {name} {status} ({window})")
            ran.append(name)
    finally:
        conn.close()
    return ran


def recent_runs(db_path: str, limit: int = 50) -> list:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        ensure_tables(conn)
        rows = conn.execute("SELECT job, window, status, started_at, finished_at, result FROM job_runs ORDER BY id DESC LIMIT ?", [limit]).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["result"] = json.loads(d["result"]) if d["result"] else None
            except ValueError:
                pass
            out.append(d)
        return out
    finally:
        conn.close()


def enabled() -> bool:
    return os.getenv("PYMASTERS_JOBS", "0") == "1"


def start_background(db_path: str, interval_s: int = 60) -> bool:
    """Start the ticking thread once (idempotent). Returns whether it is running."""
    global _thread
    if not enabled():
        return False
    if _thread and _thread.is_alive():
        return True

    def loop():
        time.sleep(20)                        # let the app finish booting
        while True:
            try:
                tick(db_path)
            except Exception as exc:  # noqa: BLE001
                print(f"[jobs] tick failed: {exc}")
            time.sleep(interval_s)

    _thread = threading.Thread(target=loop, name="pymasters-jobs", daemon=True)
    _thread.start()
    return True
