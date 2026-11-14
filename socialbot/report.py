"""Plain-text summary of the social bot for the daily status email."""
import json
import time
from datetime import datetime, timedelta, timezone

from socialbot import config, store


def _tok_days(path):
    try:
        t = json.loads(path.read_text())
        return int((t.get("expires_at", 0) - time.time()) // 86400) if t.get("expires_at") else None
    except Exception:
        return None


def text():
    from socialbot.publish import linkedin as li
    from socialbot.publish import youtube as yt
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(days=1)).isoformat()
    items = store.items(limit=300)
    out = []
    pub = [i for i in items if i["status"] in ("published", "scheduled") and (i["updated_at"] or "") >= day_ago]
    out.append(f"- published/scheduled in the last 24h: {len(pub)}")
    for i in pub:
        out.append(f"  - {i['kind']}: {i['topic'][:60]} -> {i['remote_url']} (publishes {(i['publish_at'] or '')[:16]} UTC)")
    upcoming = sorted([i for i in items if i["status"] in ("rendered", "scheduled") and (i["publish_at"] or "") > now.isoformat()],
                      key=lambda x: x["publish_at"])
    out.append(f"- queued for the next days: {len(upcoming)}")
    for i in upcoming[:6]:
        out.append(f"  - {i['publish_at'][:16]} UTC {i['kind']}: {i['topic'][:60]} (score {i['score']})")
    rej = [i for i in items if i["status"] in ("rejected", "failed") and (i["created_at"] or "") >= day_ago]
    if rej:
        out.append(f"- dropped by the quality gate or failed in the last 24h: {len(rej)}")
        for i in rej[:4]:
            out.append(f"  - {i['kind']} {i['status']}: {i['topic'][:50]} ({(i['error'] or '')[:120]})")
    errs = [i for i in items if i["status"] == "rendered" and (i["error"] or "").startswith("publish:")]
    for i in errs[:3]:
        out.append(f"- PUBLISH ERROR #{i['id']} {i['kind']}: {i['error'][:160]}")
    out.append(f"- LinkedIn posts as: {'PyMasters company page' if li.PROFILES['org']['token'].exists() else 'owner profile (company page pending LinkedIn Community Management API review)'}")
    for name, path in (("LinkedIn page token", li.PROFILES["org"]["token"]), ("LinkedIn member token", li.PROFILES["member"]["token"])):
        d = _tok_days(path)
        if d is not None:
            out.append(f"- {name} expires in {d} days" + ("  <-- ACTION: re-run `python -m socialbot auth linkedin`" if d < 10 else ""))
    out.append(f"- YouTube authorised: {'yes' if yt.TOKEN_FILE.exists() else 'NO'}")
    from socialbot.publish import drive as gd
    out.append(f"- Google Drive backup ({config.GOOGLE_DRIVE_EMAIL}): {'yes' if gd.is_authorised() else 'not authorised (run `python -m socialbot auth drive`)'}")
    with store.db() as c:
        rows = c.execute("SELECT i.kind, i.topic, m.views, m.likes, m.comments FROM metrics m JOIN items i ON i.id=m.item_id "
                         "WHERE m.taken_at=(SELECT MAX(taken_at) FROM metrics) ORDER BY COALESCE(m.views,0) DESC LIMIT 5").fetchall()
    if rows:
        out.append("- top content (latest stats):")
        for r in rows:
            out.append(f"  - {r['kind']}: {r['topic'][:50]} views={r['views']} likes={r['likes']} comments={r['comments']}")
    cost = sum((i["cost_usd"] or 0) for i in items if (i["created_at"] or "") >= day_ago)
    out.append(f"- writing/critique cost last 24h: ${cost:.2f}")
    return "\n".join(out)
