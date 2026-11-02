"""Cadence: decide what to make, when it goes out, and publish what is due.

`tick` runs every 15 minutes from a systemd timer:
  - between 01:00 and 06:00 IST it renders ahead (heavy work at night), keeping the next 2 slots of each kind filled;
  - YouTube items are uploaded as soon as they are rendered, scheduled with publishAt = their slot;
  - LinkedIn items are posted when their slot time arrives (the API has no native scheduling)."""
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from socialbot import config, store

log = logging.getLogger("socialbot.scheduler")
TZ = ZoneInfo(config.TIMEZONE)
AHEAD = 2


def upcoming_slots(kind, days=14):
    c = config.CADENCE[kind]
    hh, mm = map(int, c["publish_hhmm"].split(":"))
    now = datetime.now(TZ)
    out = []
    for i in range(days):
        day = (now + timedelta(days=i)).date()
        if day.weekday() in c["weekdays"]:
            slot = datetime(day.year, day.month, day.day, hh, mm, tzinfo=TZ)
            if slot > now + timedelta(hours=2):
                out.append(slot.astimezone(timezone.utc).replace(microsecond=0).isoformat())
    return out


def _taken(kind):
    return {it["publish_at"] for it in store.items(kind=kind, limit=200)
            if it["publish_at"] and it["status"] in ("rendered", "scheduled", "published")}


def assign_slots():
    """Give every rendered item without a slot the earliest free slot of its kind."""
    for kind in config.CADENCE:
        free = [s for s in upcoming_slots(kind) if s not in _taken(kind)]
        for it in sorted(store.items(status="rendered", kind=kind), key=lambda x: x["id"]):
            if not it["publish_at"] and free:
                store.update_item(it["id"], publish_at=free.pop(0))


def produce_ahead():
    from socialbot import pipeline
    for kind in ("linkedin", "short", "long"):
        slots = upcoming_slots(kind)[:AHEAD]
        have = len([it for it in store.items(kind=kind, limit=50)
                    if it["status"] in ("rendered", "scheduled") and it["publish_at"] and it["publish_at"] in slots])
        unslotted = len([it for it in store.items(status="rendered", kind=kind) if not it["publish_at"]])
        need = len(slots) - have - unslotted
        for _ in range(max(0, need)):
            for attempt in range(3):   # a rejected lesson is skipped; try fresh material
                item_id = pipeline.produce(kind)
                if store.get_item(item_id)["status"] == "rendered":
                    break
        assign_slots()


def publish_due(dry_run=False):
    assign_slots()
    now = datetime.now(timezone.utc).isoformat()
    for it in reversed(store.items(status="rendered", limit=50)):
        if not it["publish_at"]:
            continue
        if it["kind"] == "linkedin" and it["publish_at"] > now:
            continue
        if dry_run:
            log.info("would publish #%s %s %s at %s", it["id"], it["kind"], it["topic"], it["publish_at"])
            continue
        try:
            if it["kind"] == "linkedin":
                from socialbot.publish import linkedin
                res = linkedin.publish(it)
                store.update_item(it["id"], status="published", remote_id=res["id"], remote_url=res["url"])
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
    li_ids = {it["remote_id"]: it["id"] for it in pub if it["kind"] == "linkedin" and it["remote_id"]}
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


def tick():
    resume_interrupted()
    hour = datetime.now(TZ).hour
    if 1 <= hour < 6:
        produce_ahead()
        if hour == 5:
            refresh_metrics()
    publish_due()
