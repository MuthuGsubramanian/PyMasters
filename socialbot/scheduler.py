"""Cadence: decide what to make, when it goes out, and publish what is due.

`tick` runs every 15 minutes from `pymasters-social.timer`, while `linkedin_hourly_tick` runs on the hour from
`10:00` to `23:00` IST via `pymasters-linkedin-hourly.timer`:
  - LinkedIn Company Page posts once every hour from 10:00 AM to 11:00 PM IST (14 slots/day, simplifying complex topics),
    keeping the next `LINKEDIN_AHEAD` (3) hourly slots pre-rendered ahead of `:00`;
  - between 01:00 and 06:00 IST `tick` renders YouTube videos ahead (heavy work at night), keeping the next 2 YouTube slots filled;
  - YouTube items are uploaded as soon as they are rendered, scheduled with publishAt = their slot;
  - LinkedIn items are posted when their hourly slot opens (strictly within 10:00–23:00 IST, max 1 publish per IST hour)."""
import fcntl
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from socialbot import config, store

log = logging.getLogger("socialbot.scheduler")
TZ = ZoneInfo(config.TIMEZONE)
AHEAD = 2
LINKEDIN_KINDS = ("linkedin", "thematic")


def _iso(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


_file_lock = store.file_lock


def _in_slot_window(c: dict, slot_dt: datetime) -> bool:
    win = c.get("window_hours")
    if not win:
        return True
    start_h, end_h = win
    h = slot_dt.astimezone(TZ).hour
    return start_h <= h <= end_h


def _can_publish_linkedin_now(now_dt: datetime) -> bool:
    """Allow LinkedIn publishing strictly during the 10:00 AM to 11:00 PM IST window
    (with a 20-minute grace window on the 23:00 IST slot so an 11 PM cold render still finishes cleanly)."""
    win = config.CADENCE.get("linkedin", {}).get("window_hours")
    if not win:
        return True
    start_h, end_h = win
    now_ist = now_dt.astimezone(TZ)
    return (start_h, 0) <= (now_ist.hour, now_ist.minute) <= (end_h, 20)


def _linkedin_published_in_hour(now_dt: datetime) -> bool:
    """Return True if any LinkedIn post already published in `now_dt`'s IST clock hour `(year, month, day, hour)`."""
    now_ist = now_dt.astimezone(TZ)
    target_bucket = (now_ist.year, now_ist.month, now_ist.day, now_ist.hour)
    for kind in LINKEDIN_KINDS:
        for it in store.items(status="published", kind=kind, limit=30):
            row = dict(it)
            for field in ("updated_at", "publish_at"):
                ts = row.get(field)
                if not ts:
                    continue
                dt_ist = datetime.fromisoformat(ts).astimezone(TZ)
                if (dt_ist.year, dt_ist.month, dt_ist.day, dt_ist.hour) == target_bucket:
                    return True
    return False


def _interval_slots(c, now, days, taken, kind="linkedin"):
    """Slots every `interval_hours` on a fixed grid (epoch day at publish_hhmm, stepping in absolute time), filtered to
    `window_hours` in IST when configured (e.g., 10:00..23:00 IST). The current hour's open slot stays available until
    a LinkedIn post is published in this IST hour, so an hourly run at 10:02 IST still fills and posts the 10:00 slot."""
    hh, mm = map(int, c["publish_hhmm"].split(":"))
    step = timedelta(hours=c["interval_hours"])
    epoch = datetime(*config.INTERVAL_EPOCH, hh, mm, tzinfo=TZ)
    current = epoch + step * ((now - epoch) // step)      # latest grid slot <= now
    cur_hour_busy = (kind in LINKEDIN_KINDS) and (not _can_publish_linkedin_now(now) or _linkedin_published_in_hour(now))
    out, slot, end = [], current, now + timedelta(days=days)
    while slot < end:
        if slot.weekday() in c["weekdays"] and _in_slot_window(c, slot):
            slot_iso = _iso(slot)
            if slot == current:
                if not cur_hour_busy and slot_iso not in taken:
                    out.append(slot_iso)
            elif slot > now:
                out.append(slot_iso)
        slot += step
    return out


def upcoming_slots(kind, days=14):
    c = config.CADENCE[kind]
    if c["per_week"] <= 0 or not c["weekdays"]:
        return []
    now = datetime.now(TZ)
    taken = _taken(kind)
    if c.get("interval_hours"):
        return _interval_slots(c, now, days, taken, kind=kind)
    hhmms = c.get("publish_hhmms") or [c["publish_hhmm"]]
    out = []
    for i in range(days):
        day = (now + timedelta(days=i)).date()
        if day.weekday() in c["weekdays"]:
            for hm in hhmms:
                hh, mm = map(int, hm.split(":"))
                slot = datetime(day.year, day.month, day.day, hh, mm, tzinfo=TZ)
                slot_iso = _iso(slot)
                if slot > now + timedelta(minutes=15):
                    out.append(slot_iso)
                elif i == 0 and slot >= now - timedelta(hours=2) and slot_iso not in taken:
                    out.append(slot_iso)
    return out


def _taken(kind):
    return {it["publish_at"] for it in store.items(kind=kind, limit=400)
            if it["publish_at"] and it["status"] in ("rendered", "scheduled", "published")}


def assign_slots():
    """Give every rendered item without a slot the earliest free slot of its kind. Interval kinds (LinkedIn) also pull
    stale past-hour or far-future rendered items into the earliest free valid 10:00–23:00 IST slot."""
    now = datetime.now(TZ)
    for kind, c in config.CADENCE.items():
        valid = upcoming_slots(kind)
        valid_set = set(valid)
        free = sorted(s for s in valid if s not in _taken(kind))
        current_iso = None
        cur_hour_busy = False
        if c.get("interval_hours"):
            hh, mm = map(int, c["publish_hhmm"].split(":"))
            step = timedelta(hours=c["interval_hours"])
            epoch = datetime(*config.INTERVAL_EPOCH, hh, mm, tzinfo=TZ)
            current_dt = epoch + step * ((now - epoch) // step)
            current_iso = _iso(current_dt)
            cur_hour_busy = (kind in LINKEDIN_KINDS) and (not _can_publish_linkedin_now(now) or _linkedin_published_in_hour(now))
        rendered = sorted(store.items(status="rendered", kind=kind, limit=200), key=lambda x: (x["publish_at"] or "~", x["id"]))
        seen_current = False
        for it in rendered:
            if not free:
                break
            pub = it["publish_at"]
            if not pub:
                store.update_item(it["id"], publish_at=free.pop(0))
                continue
            if not c.get("interval_hours"):
                continue
            pub_dt = datetime.fromisoformat(pub).astimezone(TZ)
            is_stale = (
                not _in_slot_window(c, pub_dt)
                or pub < current_iso
                or (pub == current_iso and (cur_hour_busy or seen_current))
            )
            if pub == current_iso and not is_stale:
                seen_current = True
                continue
            if is_stale or pub > free[0]:
                if pub in valid_set:
                    free.append(pub)
                store.update_item(it["id"], publish_at=free.pop(0))
                free.sort()


def produce_ahead(ahead=AHEAD, kinds=("linkedin", "short", "long")):
    from socialbot import pipeline
    assign_slots()   # slot (and pull forward) what is already rendered before counting what is missing
    for kind in kinds:
        slots = upcoming_slots(kind)[:ahead]
        have = len([it for it in store.items(kind=kind, limit=200)
                    if it["status"] in ("rendered", "scheduled", "published") and it["publish_at"] and it["publish_at"] in slots])
        unslotted = len([it for it in store.items(status="rendered", kind=kind, limit=200) if not it["publish_at"]])
        need = len(slots) - have - unslotted
        for _ in range(max(0, need)):
            for attempt in range(3):   # a rejected lesson is skipped; try fresh material
                item_id = pipeline.produce(kind)
                if store.get_item(item_id)["status"] == "rendered":
                    break
        assign_slots()


def publish_due(dry_run=False, kinds=None):
    with _file_lock("publish.lock", blocking=True):
        assign_slots()
        now_dt = datetime.now(TZ)
        now = now_dt.astimezone(timezone.utc).isoformat()
        can_post_linkedin = _can_publish_linkedin_now(now_dt)
        linkedin_sent_this_hour = _linkedin_published_in_hour(now_dt)
        for it in reversed(store.items(status="rendered", limit=200)):
            if kinds and it["kind"] not in kinds:
                continue
            if not it["publish_at"]:
                continue
            if it["kind"] in LINKEDIN_KINDS:
                if config.CADENCE.get(it["kind"], {}).get("per_week", 0) <= 0:
                    continue
                if not can_post_linkedin or it["publish_at"] > now or linkedin_sent_this_hour:
                    continue
            if dry_run:
                log.info("would publish #%s %s %s at %s", it["id"], it["kind"], it["topic"], it["publish_at"])
                continue
            try:
                if it["kind"] in LINKEDIN_KINDS:
                    from socialbot.publish import linkedin
                    res = linkedin.publish(it)
                    store.update_item(it["id"], status="published", remote_id=res["id"], remote_url=res["url"])
                    linkedin_sent_this_hour = True
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
        for it in store.items(status="scheduled", limit=100):
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


def resume_interrupted(kinds=None):
    """Re-render any item left in 'drafted' status by an interrupted run without spending new LLM tokens.
    Uses a non-blocking per-item flock (`render-{id}.lock`) so a background timer tick never collides with
    an actively rendering `produce` process."""
    from socialbot import pipeline, sources
    for it in store.items(status="drafted", limit=20):
        if kinds and it["kind"] not in kinds:
            continue
        try:
            with _file_lock(f"render-{it['id']}.lock", blocking=False):
                fresh = store.get_item(it["id"])
                if not fresh or fresh["status"] != "drafted":
                    continue
                les = next((l for l in sources.candidates() if l["key"] == fresh["source_key"]), None)
                if not les:
                    store.update_item(fresh["id"], status="failed", error="resume: lesson no longer exists")
                    continue
                log.info("resuming interrupted render #%s %s", fresh["id"], fresh["kind"])
                out_dir = config.RENDERS_DIR / f"{datetime.now():%Y%m%d}-{fresh['kind']}-{fresh['id']}"
                try:
                    media = pipeline.render(fresh["kind"], fresh["draft"], les, out_dir)
                    media["lesson_url"] = les["url"]
                    store.update_item(fresh["id"], status="rendered", media=media, error=None)
                    try:
                        from socialbot.publish import drive
                        if drive.is_authorised():
                            drive.sync_item(store.get_item(fresh["id"]))
                    except Exception as e:
                        log.warning("drive sync skipped for resumed #%s: %s", fresh["id"], e)
                except Exception as e:
                    log.exception("resume render failed")
                    store.update_item(fresh["id"], status="failed", error=f"render: {e}"[:500])
        except BlockingIOError:
            log.info("skipping render #%s (%s): already rendering in another process", it["id"], it["kind"])
            continue


def refresh_daily_trends():
    try:
        from socialbot import trends
        trends.capture_daily_trends(live_network=True)
        trends.capture_weekly_thematic(live_network=True)
    except Exception as e:
        log.warning("daily trends capture: %s", e)


def _wait_if_hot(max_wait_s: int = 180):
    """If laptop CPU zone >= 80 C, pause briefly before starting FFmpeg renders outside pymasters-heavy.slice."""
    import glob
    import time
    deadline = time.monotonic() + max_wait_s
    while time.monotonic() < deadline:
        hot = 0.0
        for p in glob.glob("/sys/class/thermal/thermal_zone*/temp"):
            try:
                hot = max(hot, int(open(p).read().strip()) / 1000.0)
            except OSError:
                pass
        if hot < 80.0:
            return
        time.sleep(10)


def linkedin_hourly_tick():
    """Dedicated hourly LinkedIn runner (10:00–23:00 IST):
    1. Immediately publish the pre-rendered LinkedIn post for the current IST hour.
    2. If the pre-rendered buffer was empty, generate & publish one complex-topic-simplified post right now.
    3. Refill the next `LINKEDIN_AHEAD` hourly slots in the background and sync Drive."""
    config.ensure_dirs()
    publish_due(kinds=("linkedin",))
    now_dt = datetime.now(TZ)
    if _can_publish_linkedin_now(now_dt) and not _linkedin_published_in_hour(now_dt):
        with _file_lock("linkedin-produce.lock", blocking=True):
            _wait_if_hot()
            resume_interrupted(kinds=("linkedin",))
            produce_ahead(ahead=1, kinds=("linkedin",))
        publish_due(kinds=("linkedin",))
    try:
        with _file_lock("linkedin-produce.lock", blocking=False):
            _wait_if_hot()
            produce_ahead(ahead=getattr(config, "LINKEDIN_AHEAD", 3), kinds=("linkedin",))
    except BlockingIOError:
        log.info("linkedin buffer refill already running in another process")
    sync_drive()


def tick():
    config.ensure_dirs()
    # Always publish due pre-rendered items first so hourly LinkedIn slots never wait behind video renders
    publish_due()
    try:
        with _file_lock("tick.lock", blocking=False):
            refresh_daily_trends()
            resume_interrupted()
            hour = datetime.now(TZ).hour
            night = 1 <= hour < 6
            try:
                with _file_lock("linkedin-produce.lock", blocking=False):
                    produce_ahead(ahead=getattr(config, "LINKEDIN_AHEAD", 3), kinds=("linkedin",))
            except BlockingIOError:
                pass
            publish_due()
            # Video rendering is heavy: fill 2 full days (4 Shorts) at night; by day keep both daily Short slots filled.
            shorts_ahead = getattr(config, "SHORTS_AHEAD_NIGHT", 4) if night else getattr(config, "SHORTS_AHEAD_DAY", 2)
            produce_ahead(ahead=shorts_ahead, kinds=("short",))
            produce_ahead(ahead=AHEAD if night else 1, kinds=("long",))
            if hour == 5:
                refresh_metrics()
            publish_due()
            sync_drive()
    except BlockingIOError:
        log.info("another socialbot tick is already running; published any due items and exiting")


def sync_drive():
    """Back up any new or updated rendered/published items to Google Drive when authorised."""
    try:
        from socialbot.publish import drive
        if drive.is_authorised():
            drive.sync_all()
    except Exception as e:
        log.warning("drive sync: %s", e)
