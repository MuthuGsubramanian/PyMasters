"""Test-state helper for the scenario suites. Runs INSIDE the disposable test container
(`docker exec <c> python /app/ops_e2e/_dbtool.py <cmd> ...`) against its throwaway SQLite DB.
It is copied in at test time and never baked into the production image.

Commands (result printed to stdout):
  reset-token <email>                latest unused password-reset token for the account
  verify-token <user_id>             latest unused email-verification token
  backdate-signup <user_id> <days>   move created_at back (to expire the 7-day trial)
  set-plan <user_id> <plan> [days]   assign a plan (optional expiry in days)
  set-org-plan <org_id> <plan>       assign an org plan
  grandfather-org <org_id>           mark an org grandfathered (full access, like approved schools)
  seed-order <user_id> <plan>        insert a pending Razorpay order row; prints its order id
  seed-completions <user_id> <lesson_id>...  record lessons as completed (boss-battle unlock)
  seed-notification <user_id> <title>        an unread in-app notification
  seed-vmessage <user_id> <text>             a pending Vaathiyaar message
"""
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta


def _conn():
    return sqlite3.connect(os.environ.get("DB_PATH", "/app/data/pymasters.db"))


def _one(sql, args):
    c = _conn()
    try:
        row = c.execute(sql, args).fetchone()
    finally:
        c.close()
    if not row:
        sys.exit(f"not found: {args}")
    return row[0]


def _write(sql, args):
    c = _conn()
    try:
        n = c.execute(sql, args).rowcount
        c.commit()
    finally:
        c.close()
    if n == 0:
        sys.exit(f"no rows updated: {args}")
    return "ok"


def main(argv):
    cmd, args = argv[0], argv[1:]
    if cmd == "reset-token":
        return _one("SELECT r.token FROM password_resets r JOIN users u ON u.id = r.user_id "
                    "WHERE lower(u.email) = lower(?) AND COALESCE(r.used,0) = 0 "
                    "ORDER BY r.created_at DESC LIMIT 1", [args[0]])
    if cmd == "verify-token":
        return _one("SELECT token FROM email_verifications WHERE user_id = ? AND COALESCE(used,0) = 0 "
                    "ORDER BY created_at DESC LIMIT 1", [args[0]])
    if cmd == "backdate-signup":
        ts = (datetime.utcnow() - timedelta(days=int(args[1]))).strftime("%Y-%m-%d %H:%M:%S")
        return _write("UPDATE users SET created_at = ? WHERE id = ?", [ts, args[0]])
    if cmd == "set-plan":
        exp = ((datetime.utcnow() + timedelta(days=int(args[2]))).strftime("%Y-%m-%d %H:%M:%S")
               if len(args) > 2 else None)
        return _write("UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?", [args[1], exp, args[0]])
    if cmd == "set-org-plan":
        return _write("UPDATE organizations SET plan = ?, plan_expires_at = NULL WHERE id = ?", [args[1], args[0]])
    if cmd == "grandfather-org":
        return _write("UPDATE organizations SET grandfathered = 1 WHERE id = ?", [args[0]])
    if cmd == "seed-order":   # the row create-order writes once Razorpay returns an order (no network in CI)
        order_id = f"order_e2e{uuid.uuid4().hex[:12]}"
        _write("INSERT INTO payments (id, user_id, plan, amount, currency, receipt, order_id, status) "
               "VALUES (?, ?, ?, 0, 'INR', 'e2e', ?, 'created')", [str(uuid.uuid4()), args[0], args[1], order_id])
        return order_id
    if cmd == "seed-completions":
        for lesson_id in args[1:]:
            _write("INSERT OR IGNORE INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES (?, ?, 0)",
                   [args[0], lesson_id])
        return "ok"
    if cmd == "seed-notification":
        return _write("INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, 'system', ?, ?, '')",
                      [args[0], args[1], f"{args[1]} (scenario test)"])
    if cmd == "seed-vmessage":
        return _write("INSERT INTO pending_vaathiyaar_messages (user_id, message, message_type) VALUES (?, ?, 'nudge')",
                      [args[0], args[1]])
    sys.exit(f"unknown command: {cmd}")


if __name__ == "__main__":
    print(main(sys.argv[1:]))
