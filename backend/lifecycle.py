"""Inactive-account lifecycle policy.

Policy (2026-07-17):
  * A user is "inactive" when their last activity (presence heartbeat
    ``users.last_seen_at``, newest ``learning_signals`` row, or account
    creation — whichever is newest) is older than INACTIVITY_DAYS (10).
  * Inactive users receive ONE removal notice (email + in-app). A pending
    ``account_lifecycle`` row prevents re-notification.
  * If the user is still inactive GRACE_DAYS (3) after the notice, the
    account is removed via the same cascading purge the self-serve
    "delete my account" endpoint uses.
  * Any activity after the notice cancels the pending removal (the row is
    cleared, so a later inactivity spell starts a fresh notice cycle).
  * Every notice, cancellation, skip and deletion is written to
    ``lifecycle_log``, which intentionally has no FK to users so history
    survives the account's deletion.

Safety: the sweep defaults to dry_run=True (reports what WOULD happen,
touches nothing). Real deletions additionally require the env switch
LIFECYCLE_DELETE_ENABLED=1 — without it a live sweep sends notices and
records state but logs `deletion_blocked` instead of deleting.
"""

import os
import sqlite3
from datetime import datetime, timedelta

INACTIVITY_DAYS = int(os.getenv("LIFECYCLE_INACTIVITY_DAYS", "10"))
GRACE_DAYS = int(os.getenv("LIFECYCLE_GRACE_DAYS", "3"))
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://pymasters.net")

_TS = "%Y-%m-%d %H:%M:%S"


def _delete_enabled() -> bool:
    return os.getenv("LIFECYCLE_DELETE_ENABLED", "0") == "1"


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS account_lifecycle (
               user_id TEXT PRIMARY KEY,
               notified_at TIMESTAMP NOT NULL,
               delete_after TIMESTAMP NOT NULL,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS lifecycle_log (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               user_id TEXT,
               username TEXT,
               email TEXT,
               action TEXT NOT NULL,
               detail TEXT,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    conn.commit()


def _log(conn, user_id, username, email, action, detail=""):
    conn.execute(
        "INSERT INTO lifecycle_log (user_id, username, email, action, detail) VALUES (?,?,?,?,?)",
        [user_id, username, email, action, detail],
    )


def _has_column(conn, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def _last_activity_expr(conn) -> str:
    """SQL expression for a user's newest activity timestamp.

    ``users.last_seen_at`` is added lazily by telemetry (ALTER TABLE), so it
    may not exist in older databases — build the expression defensively.
    """
    parts = [
        "COALESCE((SELECT MAX(created_at) FROM learning_signals ls WHERE ls.user_id = u.id), '')",
        "COALESCE(u.created_at, '')",
    ]
    if _has_column(conn, "users", "last_seen_at"):
        parts.insert(0, "COALESCE(u.last_seen_at, '')")
    return "MAX(" + ", ".join(parts) + ")"


def _send_notice(user_id, username, email) -> dict:
    """Send the removal warning by email + in-app. Best-effort per channel."""
    days = GRACE_DAYS
    title = "Your PyMasters account is scheduled for removal"
    message = (
        f"Vanakkam {username or 'there'}! We noticed you haven't visited PyMasters in over "
        f"{INACTIVITY_DAYS} days. Your account (and its XP, streaks and progress) will be "
        f"permanently removed in {days} days unless you log in again. "
        f"Just visiting {APP_BASE_URL} while logged in keeps your account."
    )
    result = {"email_sent": False, "inapp_sent": False}
    if email:
        try:
            from notifications.email_sender import send_email
            html = (
                f"<div style=\"font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px\">"
                f"<h2 style=\"color:#7c3aed\">PyMasters</h2>"
                f"<p style=\"color:#334155\">{message}</p>"
                f"<a href=\"{APP_BASE_URL}/login\" style=\"display:inline-block;background:#7c3aed;color:#fff;"
                f"padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold\">Keep my account</a>"
                f"</div>"
            )
            result["email_sent"] = send_email(email, title, message, html)
        except Exception as exc:
            result["email_error"] = str(exc)[:200]
    try:
        from notifications.dispatcher import create_notification
        create_notification(
            user_id=user_id,
            notif_type="account_lifecycle",
            title=title,
            message=message,
            link="/dashboard",
        )
        result["inapp_sent"] = True
    except Exception as exc:
        result["inapp_error"] = str(exc)[:200]
    return result


def run_sweep(db_path: str, dry_run: bool = True, now: datetime = None) -> dict:
    """Run one lifecycle pass. Returns a summary dict (safe to JSON-encode)."""
    now = now or datetime.utcnow()
    now_s = now.strftime(_TS)
    inactive_cutoff = (now - timedelta(days=INACTIVITY_DAYS)).strftime(_TS)
    delete_after = (now + timedelta(days=GRACE_DAYS)).strftime(_TS)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        ensure_tables(conn)
        activity = _last_activity_expr(conn)
        summary = {
            "dry_run": dry_run,
            "delete_enabled": _delete_enabled(),
            "inactivity_days": INACTIVITY_DAYS,
            "grace_days": GRACE_DAYS,
            "notified": [], "cancelled": [], "deleted": [],
            "deletion_blocked": [], "skipped": [],
        }

        # 1) Cancel pending removals for users who came back.
        rows = conn.execute(
            f"""SELECT al.user_id, al.notified_at, u.username, u.email,
                       {activity} AS last_activity
                FROM account_lifecycle al JOIN users u ON u.id = al.user_id"""
        ).fetchall()
        for r in rows:
            if r["last_activity"] and r["last_activity"] > str(r["notified_at"]):
                summary["cancelled"].append(r["user_id"])
                if not dry_run:
                    conn.execute("DELETE FROM account_lifecycle WHERE user_id = ?", [r["user_id"]])
                    _log(conn, r["user_id"], r["username"], r["email"],
                         "removal_cancelled", f"active again at {r['last_activity']}")

        # Orphaned lifecycle rows (user already gone) — clear them.
        if not dry_run:
            conn.execute(
                "DELETE FROM account_lifecycle WHERE user_id NOT IN (SELECT id FROM users)"
            )
        # Release our write lock before _send_notice: create_notification
        # opens its OWN connection to this DB, and an uncommitted write here
        # makes that insert fail with "database is locked".
        conn.commit()

        # 2) Notify newly-inactive users (never super admins, never twice).
        candidates = conn.execute(
            f"""SELECT u.id, u.username, u.email, {activity} AS last_activity
                FROM users u
                WHERE COALESCE(u.is_super_admin, 0) = 0
                  AND u.id NOT IN (SELECT user_id FROM account_lifecycle)"""
        ).fetchall()
        for u in candidates:
            if not u["last_activity"] or u["last_activity"] >= inactive_cutoff:
                continue
            entry = {"user_id": u["id"], "username": u["username"],
                     "last_activity": u["last_activity"]}
            if dry_run:
                summary["notified"].append(entry)
                continue
            channels = _send_notice(u["id"], u["username"], u["email"])
            entry.update(channels)
            summary["notified"].append(entry)
            conn.execute(
                "INSERT INTO account_lifecycle (user_id, notified_at, delete_after) VALUES (?,?,?)",
                [u["id"], now_s, delete_after],
            )
            _log(conn, u["id"], u["username"], u["email"], "notice_sent",
                 f"last_activity={u['last_activity']} delete_after={delete_after} {channels}")
            conn.commit()  # keep the lock window closed for the next notice

        # 3) Remove accounts whose grace period lapsed and are still inactive.
        due = conn.execute(
            f"""SELECT al.user_id, al.delete_after, u.username, u.email,
                       {activity} AS last_activity
                FROM account_lifecycle al JOIN users u ON u.id = al.user_id
                WHERE al.delete_after <= ?""",
            [now_s],
        ).fetchall()
        for r in due:
            if r["last_activity"] and r["last_activity"] > str(r["delete_after"]):
                # Became active during the race — treat as cancellation.
                summary["cancelled"].append(r["user_id"])
                if not dry_run:
                    conn.execute("DELETE FROM account_lifecycle WHERE user_id = ?", [r["user_id"]])
                    _log(conn, r["user_id"], r["username"], r["email"],
                         "removal_cancelled", "active during grace period")
                continue
            if dry_run:
                summary["deleted"].append(r["user_id"])
                continue
            if not _delete_enabled():
                summary["deletion_blocked"].append(r["user_id"])
                _log(conn, r["user_id"], r["username"], r["email"], "deletion_blocked",
                     "LIFECYCLE_DELETE_ENABLED is not set — account kept")
                continue
            # Never auto-delete the only super_admin of an organization —
            # that would strand the org (mirrors the 409 guard in the
            # self-serve delete endpoint).
            sole_admin = conn.execute(
                """SELECT 1 FROM org_members om
                   WHERE om.user_id = ? AND om.role = 'super_admin'
                     AND NOT EXISTS (
                         SELECT 1 FROM org_members o2
                         WHERE o2.org_id = om.org_id AND o2.role = 'super_admin'
                           AND o2.user_id != om.user_id)
                   LIMIT 1""",
                [r["user_id"]],
            ).fetchone()
            if sole_admin:
                summary["skipped"].append({"user_id": r["user_id"],
                                           "reason": "sole_org_super_admin"})
                _log(conn, r["user_id"], r["username"], r["email"], "deletion_skipped",
                     "sole super_admin of an organization")
                continue
            try:
                from routes.profile import purge_user_data
                cursor = conn.cursor()
                purge_user_data(cursor, r["user_id"])
                conn.execute("DELETE FROM account_lifecycle WHERE user_id = ?", [r["user_id"]])
                _log(conn, r["user_id"], r["username"], r["email"], "account_deleted",
                     f"inactive since {r['last_activity']}, notice grace lapsed {r['delete_after']}")
                summary["deleted"].append(r["user_id"])
            except Exception as exc:
                summary["skipped"].append({"user_id": r["user_id"], "error": str(exc)[:200]})
                _log(conn, r["user_id"], r["username"], r["email"], "deletion_failed",
                     str(exc)[:300])

        if not dry_run:
            _log(conn, None, None, None, "sweep_completed",
                 f"notified={len(summary['notified'])} cancelled={len(summary['cancelled'])} "
                 f"deleted={len(summary['deleted'])} blocked={len(summary['deletion_blocked'])}")
        conn.commit()
        return summary
    finally:
        conn.close()
