"""Shared XP bookkeeping.

`award_xp` is idempotent per (user, source, ref): the Play feature calls it once
per round id, so a retried /finish never double-pays. Classroom keeps its own
`lesson_completions` dedupe for now (migrating it is a separate cleanup).
"""
import sqlite3


def ensure_tables(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS xp_awards ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " user_id TEXT NOT NULL, source TEXT NOT NULL, ref TEXT NOT NULL,"
            " amount INTEGER NOT NULL,"
            " created_at TEXT DEFAULT CURRENT_TIMESTAMP,"
            " UNIQUE(user_id, source, ref))"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_xp_awards_user_day ON xp_awards(user_id, created_at)")
        conn.commit()
    finally:
        conn.close()


def award_xp(conn, user_id: str, amount: int, source: str, ref: str) -> int:
    """Add `amount` to users.points once per (user, source, ref). Caller commits.

    Returns the amount actually awarded (0 on a duplicate or non-positive amount).
    """
    amount = int(amount or 0)
    if amount <= 0 or not user_id:
        return 0
    cur = conn.execute(
        "INSERT OR IGNORE INTO xp_awards (user_id, source, ref, amount) VALUES (?, ?, ?, ?)",
        [user_id, source, str(ref), amount],
    )
    if cur.rowcount != 1:
        return 0
    conn.execute("UPDATE users SET points = COALESCE(points, 0) + ? WHERE id = ?", [amount, user_id])
    return amount


def today_xp(conn, user_id: str, source: str | None = None) -> int:
    sql = "SELECT COALESCE(SUM(amount), 0) FROM xp_awards WHERE user_id = ? AND date(created_at) = date('now')"
    args = [user_id]
    if source:
        sql += " AND source = ?"
        args.append(source)
    return int(conn.execute(sql, args).fetchone()[0])
