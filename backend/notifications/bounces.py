"""Block accounts whose account-closure warning email hard-bounces (owner rule, 2026-11-02).

The lifecycle sweep (lifecycle.py) emails idle accounts "Your PyMasters account is scheduled for
removal". When that email bounces permanently (the address does not exist / is disabled), the account
is almost certainly fake or abandoned, so it is blocked right away instead of waiting out the grace
period.

Bounces come back to the sending mailbox (SMTP_USER on the primary Gmail/Workspace SMTP) as RFC 3464
delivery-status reports. A daily job reads that mailbox over IMAP (same credentials), and blocks a user
only when ALL of these hold:
  * the bounce is permanent (status 5.x.x / Action: failed),
  * it is for the closure warning (original subject matches) OR the user has a recorded closure notice,
  * the user is not a founder (super admin).
Blocking sets users.is_blocked=1 and bumps token_version (signs out every session); it is logged in
lifecycle_log ('blocked_bounce') and every processed bounce is remembered in email_bounces, so re-runs
never double-process. Fails safe: if IMAP is unreachable nobody is blocked.
"""
import email
import imaplib
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from email import policy

NOTICE_SUBJECT = "Your PyMasters account is scheduled for removal"
LOOKBACK_DAYS = 14
_STATUS_RE = re.compile(r"^Status:\s*([245])\.\d{1,3}\.\d{1,3}", re.I | re.M)
_FINAL_RE = re.compile(r"^(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s>]+@[^\s>]+)>?", re.I | re.M)
_ACTION_RE = re.compile(r"^Action:\s*(\w+)", re.I | re.M)


def ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS email_bounces (
               message_key TEXT PRIMARY KEY,
               email TEXT,
               status TEXT,
               original_subject TEXT,
               action TEXT,
               user_id TEXT,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    conn.commit()


def parse_bounce(raw: bytes) -> list:
    """Return [{'email', 'status', 'action', 'original_subject'}] for each failed recipient in a DSN."""
    msg = email.message_from_bytes(raw, policy=policy.default)
    texts, original_subject = [], ""
    for part in msg.walk():
        ctype = part.get_content_type()
        if ctype in ("message/delivery-status", "text/plain"):
            payload = part.get_payload(decode=True)
            if payload is None and part.is_multipart() is False:
                payload = str(part.get_payload()).encode()
            if payload is None:
                # message/delivery-status is parsed into sub-messages by the email package
                payload = "\n".join(str(p) for p in (part.get_payload() or [])).encode()
            texts.append(payload.decode("utf-8", errors="replace"))
        elif ctype in ("text/rfc822-headers", "message/rfc822"):
            inner = part.get_payload(0) if ctype == "message/rfc822" else \
                email.message_from_bytes(part.get_payload(decode=True) or b"", policy=policy.default)
            try:
                original_subject = original_subject or str(inner.get("Subject", ""))
            except Exception:
                pass
    blob = "\n".join(texts)
    if not original_subject:
        m = re.search(r"^Subject:\s*(.+)$", blob, re.M)
        original_subject = m.group(1).strip() if m else ""
    status_m = _STATUS_RE.search(blob)
    action_m = _ACTION_RE.search(blob)
    recipients = {r.lower() for r in _FINAL_RE.findall(blob)}
    failed_hdr = msg.get("X-Failed-Recipients")
    if failed_hdr:
        recipients |= {a.strip().lower() for a in str(failed_hdr).split(",") if "@" in a}
    status = (status_m.group(0).split(":", 1)[1].strip() if status_m else "")
    action = (action_m.group(1).lower() if action_m else ("failed" if failed_hdr else ""))
    return [{"email": r, "status": status, "action": action, "original_subject": original_subject}
            for r in sorted(recipients)]


def _is_hard(b: dict) -> bool:
    """Permanent failure: a 5.x.x status, or a final report (Action: failed) - mail servers send that
    after giving up on a 4.x condition that never cleared. 'delayed' 4.x reports are temporary."""
    return b["status"].startswith("5") or b["action"] == "failed"


def fetch_imap_bounces(lookback_days: int = LOOKBACK_DAYS) -> list:
    """[(message_key, raw_bytes)] for delivery-failure reports in the sending mailbox."""
    user, pwd = os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASS", "")
    if not user or not pwd:
        raise RuntimeError("SMTP_USER/SMTP_PASS not configured")
    host = os.environ.get("BOUNCE_IMAP_HOST") or os.environ.get("SMTP_HOST", "smtp.gmail.com").replace("smtp.", "imap.", 1)
    since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%d-%b-%Y")
    out = []
    with imaplib.IMAP4_SSL(host, 993, timeout=30) as imap:
        imap.login(user, pwd)
        imap.select("INBOX", readonly=True)
        keys = set()
        for crit in ('FROM "mailer-daemon"', 'FROM "postmaster"', 'SUBJECT "Delivery Status Notification"',
                     'SUBJECT "Undeliverable"', 'SUBJECT "Mail delivery failed"'):
            typ, data = imap.search(None, f'(SINCE {since} {crit})')
            if typ == "OK" and data and data[0]:
                keys.update(data[0].split())
        for num in sorted(keys, key=int):
            typ, msg_data = imap.fetch(num, "(BODY.PEEK[])")
            if typ != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                continue
            raw = msg_data[0][1]
            mid = email.message_from_bytes(raw).get("Message-ID") or f"imap-{num.decode()}"
            out.append((str(mid), raw))
    return out


def process_bounces(db_path: str, fetch=fetch_imap_bounces) -> dict:
    summary = {"checked": 0, "hard_bounces": 0, "blocked": [], "ignored": 0}
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        ensure_table(conn)
        from lifecycle import ensure_tables as _lc_tables, _log
        _lc_tables(conn)
        for key, raw in fetch():
            if conn.execute("SELECT 1 FROM email_bounces WHERE message_key = ?", [key]).fetchone():
                continue
            summary["checked"] += 1
            for b in parse_bounce(raw) or [{"email": "", "status": "", "action": "", "original_subject": ""}]:
                action, user_id = "ignored", None
                if b["email"] and _is_hard(b):
                    summary["hard_bounces"] += 1
                    u = conn.execute(
                        "SELECT id, username, email, COALESCE(is_super_admin,0) AS sa, COALESCE(is_blocked,0) AS blocked "
                        "FROM users WHERE lower(COALESCE(email,'')) = ?", [b["email"]]).fetchone()
                    if u:
                        user_id = u["id"]
                        noticed = conn.execute(
                            "SELECT 1 FROM account_lifecycle WHERE user_id = ? UNION "
                            "SELECT 1 FROM lifecycle_log WHERE user_id = ? AND action = 'notice_sent'",
                            [u["id"], u["id"]]).fetchone()
                        about_notice = NOTICE_SUBJECT.lower() in (b["original_subject"] or "").lower()
                        if u["sa"]:
                            action = "skipped_founder"
                        elif u["blocked"]:
                            action = "already_blocked"
                        elif about_notice or noticed:
                            conn.execute(
                                "UPDATE users SET is_blocked = 1, token_version = COALESCE(token_version,0) + 1 "
                                "WHERE id = ?", [u["id"]])
                            _log(conn, u["id"], u["username"], u["email"], "blocked_bounce",
                                 f"closure warning hard-bounced: status={b['status'] or 'failed'}")
                            action = "blocked"
                            summary["blocked"].append(u["username"])
                        else:
                            action = "not_a_closure_warning"
                if action == "ignored" or action.startswith("not_"):
                    summary["ignored"] += 1
                conn.execute(
                    "INSERT OR IGNORE INTO email_bounces (message_key, email, status, original_subject, action, user_id) "
                    "VALUES (?,?,?,?,?,?)",
                    [key, b["email"], b["status"], (b["original_subject"] or "")[:200], action, user_id])
            conn.commit()
    finally:
        conn.close()
    return summary
