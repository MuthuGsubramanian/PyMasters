"""SQLite state: every planned, rendered and published item, so the bot never repeats itself and the
daily email can report exactly what happened."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from socialbot import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,                 -- short | long | linkedin
    source_key TEXT NOT NULL,           -- e.g. lesson:python_intermediate/async_advanced
    topic TEXT NOT NULL,
    status TEXT NOT NULL,               -- drafted | rejected | rendered | scheduled | published | failed
    score REAL,
    draft TEXT,                         -- JSON: script / post / metadata
    critique TEXT,                      -- JSON from the critic
    media TEXT,                         -- JSON: paths of rendered files
    publish_at TEXT,                    -- ISO UTC
    remote_id TEXT,                     -- YouTube video id / LinkedIn post urn
    remote_url TEXT,
    error TEXT,
    cost_usd REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_kind_status ON items(kind, status);
CREATE TABLE IF NOT EXISTS metrics (
    item_id INTEGER NOT NULL,
    taken_at TEXT NOT NULL,
    views INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, impressions INTEGER,
    PRIMARY KEY (item_id, taken_at)
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@contextmanager
def db():
    config.ensure_dirs()
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def add_item(kind: str, source_key: str, topic: str, status: str, **fields) -> int:
    ts = now_iso()
    cols = {"kind": kind, "source_key": source_key, "topic": topic, "status": status,
            "created_at": ts, "updated_at": ts}
    cols.update({k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in fields.items()})
    with db() as c:
        cur = c.execute(f"INSERT INTO items ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                        list(cols.values()))
        return cur.lastrowid


def update_item(item_id: int, **fields):
    fields["updated_at"] = now_iso()
    vals = [(json.dumps(v) if isinstance(v, (dict, list)) else v) for v in fields.values()]
    with db() as c:
        c.execute(f"UPDATE items SET {','.join(f'{k}=?' for k in fields)} WHERE id=?", vals + [item_id])


def get_item(item_id: int) -> dict:
    with db() as c:
        r = c.execute("SELECT * FROM items WHERE id=?", [item_id]).fetchone()
    return _decode(r) if r else None


def items(status=None, kind=None, limit=100) -> list:
    q, args = "SELECT * FROM items WHERE 1=1", []
    if status:
        q += " AND status=?"; args.append(status)
    if kind:
        q += " AND kind=?"; args.append(kind)
    q += " ORDER BY id DESC LIMIT ?"; args.append(limit)
    with db() as c:
        return [_decode(r) for r in c.execute(q, args).fetchall()]


def recently_used_sources(days: int = config.NO_REPEAT_DAYS, rejected_days: int = 14) -> set:
    """(source_key, kind) pairs used in the last `days`, or rejected/failed in the last `rejected_days`
    (so the bot moves on to other material instead of retrying the same lesson)."""
    now = datetime.now(timezone.utc)
    since, since_rej = (now - timedelta(days=days)).isoformat(), (now - timedelta(days=rejected_days)).isoformat()
    with db() as c:
        rows = c.execute("SELECT source_key, kind FROM items WHERE (status NOT IN ('rejected','failed') AND created_at >= ?)"
                         " OR (status IN ('rejected','failed') AND created_at >= ?)", [since, since_rej]).fetchall()
    return {(r["source_key"], r["kind"]) for r in rows}


def recent_topics(limit: int = 60) -> list:
    with db() as c:
        return [r[0] for r in c.execute("SELECT topic FROM items WHERE status NOT IN ('rejected','failed') "
                                        "ORDER BY id DESC LIMIT ?", [limit]).fetchall()]


def _decode(r) -> dict:
    d = dict(r)
    for k in ("draft", "critique", "media"):
        if d.get(k):
            try:
                d[k] = json.loads(d[k])
            except (TypeError, ValueError):
                pass
    return d
