"""Cadence: decide what to make, when it goes out, and publish what is due.

`tick` runs every 15 minutes from a systemd timer:
  - between 01:00 and 06:00 IST it renders videos ahead (heavy work at night), keeping the next 2 YouTube slots filled;
  - LinkedIn is minimized to 1 post per week (only the next 1 slot is kept queued);
  - YouTube items are uploaded as soon as they are rendered, scheduled with publishAt = their slot;
  - LinkedIn items are posted when their slot time arrives (capped at 1 LinkedIn publish per ISO week)."""
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from socialbot import config, store

log = logging.getLogger("socialbot.scheduler")
TZ = ZoneInfo(config.TIMEZONE)
AHEAD = 2


def _iso(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _interval_slots(c, now, days, taken):
    """Slots every `interval_hours` on a fixed grid (epoch day at publish_hhmm, stepping in absolute time), so each slot
    is exactly interval_hours after the previous one, across midnight too, and the same on every run. The window that
    is open right now is kept until it is taken, so a missed slot is still filled and posted straight away."""
    hh, mm = map(int, c["publish_hhmm"].split(":"))
    step = timedelta(hours=c["interval_hours"])
    epoch = datetime(*config.INTERVAL_EPOCH, hh, mm, tzinfo=TZ)
    current = epoch + step * ((now - epoch) // step)      # latest slot <= now
    out, slot, end = [], current, now + timedelta(days=days)
    while slot < end:
        if slot.weekday() in c["weekdays"] and (slot > now or _iso(slot) not in taken):
            out.append(_iso(slot))
        slot += step
    return out


def upcoming_slots(kind, days=14):
    c = config.CADENCE[kind]
    if c["per_week"] <= 0 or not c["weekdays"]:
        return []
    now = datetime.now(TZ)
    taken = _taken(kind)
    if c.get("interval_hours"):
        return _interval_slots(c, now, days, taken)
    hh, mm = map(int, c["publish_hhmm"].split(":"))
    out = []
    for i in range(days):
        day = (now + timedelta(days=i)).date()
        if day.weekday() in c["weekdays"]:
            slot = datetime(day.year, day.month, day.day, hh, mm, tzinfo=TZ)
            slot_iso = _iso(slot)
            if i == 0 and slot_iso not in taken:
                out.append(slot_iso)
            elif slot > now + timedelta(minutes=15):
                out.append(slot_iso)
    return out


def _taken(kind):
    return {it["publish_at"] for it in store.items(kind=kind, limit=200)
            if it["publish_at"] and it["status"] in ("rendered", "scheduled", "published")}


def assign_slots():
    """Give every rendered item without a slot the earliest free slot of its kind. Interval kinds (LinkedIn) also pull
    rendered-but-unposted items forward, so the next due slot is never empty while a post waits further out."""
    for kind, c in config.CADENCE.items():
        free = sorted(s for s in upcoming_slots(kind) if s not in _taken(kind))
        rendered = sorted(store.items(status="rendered", kind=kind), key=lambda x: (x["publish_at"] or "~", x["id"]))
        for it in rendered:
            if not free:
                break
            if not it["publish_at"]:
                store.update_item(it["id"], publish_at=free.pop(0))
            elif c.get("interval_hours") and it["publish_at"] > free[0]:
                free.append(it["publish_at"])
                store.update_item(it["id"], publish_at=free.pop(0))
                free.sort()


def produce_ahead(ahead=AHEAD, kinds=("linkedin", "short", "long")):
    from socialbot import pipeline
    assign_slots()   # slot (and pull forward) what is already rendered before counting what is missing
    for kind in kinds:
        slots = upcoming_slots(kind)[:ahead]
        have = len([it for it in store.items(kind=kind, limit=50)
                    if it["status"] in ("rendered", "scheduled", "published") and it["publish_at"] and it["publish_at"] in slots])
        unslotted = len([it for it in store.items(status="rendered", kind=kind) if not it["publish_at"]])
        need = len(slots) - have - unslotted
        for _ in range(max(0, need)):
            for attempt in range(3):   # a rejected lesson is skipped; try fresh material
                item_id = pipeline.produce(kind)
                if store.get_item(item_id)["status"] == "rendered":
                    break
        assign_slots()


LINKEDIN_KINDS = ("linkedin", "thematic")


def _linkedin_published_in_week(now_dt):
    """Return True if any LinkedIn post (standard or thematic) already published in now_dt's ISO week (IST)."""
    target_week = now_dt.astimezone(TZ).isocalendar()[:2]
    for kind in LINKEDIN_KINDS:
        for it in store.items(status="published", kind=kind, limit=10):
            row = dict(it)
            ts = row.get("publish_at") or row.get("updated_at") or row.get("created_at")
            if ts and datetime.fromisoformat(ts).astimezone(TZ).isocalendar()[:2] == target_week:
                return True
    return False


def publish_due(dry_run=False):
    assign_slots()
    now_dt = datetime.now(TZ)
    now = now_dt.astimezone(timezone.utc).isoformat()
    linkedin_sent_this_week = _linkedin_published_in_week(now_dt)
    for it in reversed(store.items(status="rendered", limit=50)):
        if not it["publish_at"]:
            continue
        if it["kind"] in LINKEDIN_KINDS:
            if config.CADENCE.get(it["kind"], {}).get("per_week", 0) <= 0:
                continue
            if it["publish_at"] > now or linkedin_sent_this_week:
                continue
        if dry_run:
            log.info("would publish #%s %s %s at %s", it["id"], it["kind"], it["topic"], it["publish_at"])
            continue
        try:
            if it["kind"] in LINKEDIN_KINDS:
                from socialbot.publish import linkedin
                res = linkedin.publish(it)
                store.update_item(it["id"], status="published", remote_id=res["id"], remote_url=res["url"])
                linkedin_sent_this_week = True
            else:
                from socialbot.publish import youtube
                res = youtube.upload(it)
                st = "scheduled" if it["publish_at"] > now else "published"
                store.update_item(it["id"], status=st, remote_id=res["id"], remote_url=res["url"])
            log.info("published #%s -> %s", it["id"], res["url"])
        except Exception as e:
            log.exception("publish failed for #%s", it["id"])
            store.update_item(it["id"], error=f"publish: {e}"[:500])
    # YouTube flips scheduled -> live by itself; mirror that once the time has passed
    for it in store.items(status="scheduled", limit=50):
        if it["publish_at"] and it["publish_at"] <= now:
            store.update_item(it["id"], status="published")


def refresh_metrics():
    from socialbot.publish import linkedin, youtube
    pub = store.items(status="published", limit=200)
    taken = store.now_iso()
    yt_ids = {it["remote_id"]: it["id"] for it in pub if it["kind"] in ("short", "long") and it["remote_id"]}
    li_ids = {it["remote_id"]: it["id"] for it in pub if it["kind"] in ("linkedin", "thematic") and it["remote_id"]}
    rows = []
    try:
        for vid, s in youtube.stats(list(yt_ids)).items():
            rows.append((yt_ids[vid], s.get("views"), s.get("likes"), s.get("comments")))
    except Exception as e:
        log.warning("youtube stats: %s", e)
    try:
        for urn, s in linkedin.stats(list(li_ids)).items():
            rows.append((li_ids[urn], None, s.get("likes"), s.get("comments")))
    except Exception as e:
        log.warning("linkedin stats: %s", e)
    with store.db() as c:
        for item_id, v, l, cm in rows:
            c.execute("INSERT OR REPLACE INTO metrics (item_id, taken_at, views, likes, comments) VALUES (?,?,?,?,?)",
                      [item_id, taken, v, l, cm])


def resume_interrupted():
    """Ticks never overlap (systemd oneshot), so an item still 'drafted' at tick start was cut off mid-render
    (e.g. the laptop's thermal power-off). Re-render it from the saved draft: no new LLM cost."""
    from socialbot import pipeline, sources
    for it in store.items(status="drafted", limit=20):
        les = next((l for l in sources.candidates() if l["key"] == it["source_key"]), None)
        if not les:
            store.update_item(it["id"], status="failed", error="resume: lesson no longer exists")
            continue
        log.info("resuming interrupted render #%s %s", it["id"], it["kind"])
        out_dir = config.RENDERS_DIR / f"{datetime.now():%Y%m%d}-{it['kind']}-{it['id']}"
        try:
            media = pipeline.render(it["kind"], it["draft"], les, out_dir)
            media["lesson_url"] = les["url"]
            store.update_item(it["id"], status="rendered", media=media, error=None)
        except Exception as e:
            log.exception("resume render failed")
            store.update_item(it["id"], status="failed", error=f"render: {e}"[:500])


def refresh_daily_trends():
    try:
        from socialbot import trends
        trends.capture_daily_trends(live_network=True)
        trends.capture_weekly_thematic(live_network=True)
    except Exception as e:
        log.warning("daily trends capture: %s", e)


def tick():
    import fcntl
    config.ensure_dirs()
    lock_file = open(config.STATE_DIR / "tick.lock", "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.info("another socialbot tick is already running; skipping")
        return
    try:
        refresh_daily_trends()
        resume_interrupted()
        hour = datetime.now(TZ).hour
        night = 1 <= hour < 6
        # LinkedIn is minimized to 1 post/week: only keep the next single slot filled.
        produce_ahead(ahead=1, kinds=("linkedin",))
        # Video rendering is heavy: fill ahead at night; by day only catch up the next immediate slot.
        produce_ahead(ahead=AHEAD if night else 1, kinds=("short", "long"))
        if hour == 5:
            refresh_metrics()
        publish_due()
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
