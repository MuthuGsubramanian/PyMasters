"""Registers the backend jobs with the scheduler. Times are UTC (IST = UTC+5:30)."""
from jobs import scheduler


def _lifecycle(db_path: str) -> dict:
    from lifecycle import run_sweep
    summary = run_sweep(db_path, dry_run=False)
    return {k: (len(v) if isinstance(v, list) else v) for k, v in summary.items()}


def _bounces(db_path: str) -> dict:
    from notifications.bounces import process_bounces
    summary = process_bounces(db_path)
    return {k: (len(v) if isinstance(v, list) else v) for k, v in summary.items()}


def register_all() -> None:
    # 02:30 UTC = 08:00 IST: notices and removals of idle accounts (21-day policy)
    scheduler.register("lifecycle", _lifecycle, every="daily", at_utc="02:30")
    # 03:30 UTC: block accounts whose closure warning hard-bounced (owner rule 2026-11-02; 14-day lookback)
    scheduler.register("bounces", _bounces, every="daily", at_utc="03:30")
    try:
        from jobs.content_job import run as _content
        scheduler.register("content", _content, every="daily", at_utc="20:30")          # 02:00 IST, off-peak
    except ImportError:
        pass
    # LinkedIn queueing (jobs/social_job.py) is retired 2026-11-02: its queue was drained by the old
    # Windows worker, which the owner replaced with the laptop social bot (socialbot/, its own
    # 3-posts-a-week cadence). Queueing here as well would double-post once that worker runs again.
