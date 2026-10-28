"""Registers the backend jobs with the scheduler. Times are UTC (IST = UTC+5:30)."""
from jobs import scheduler


def _lifecycle(db_path: str) -> dict:
    from lifecycle import run_sweep
    summary = run_sweep(db_path, dry_run=False)
    return {k: (len(v) if isinstance(v, list) else v) for k, v in summary.items()}


def register_all() -> None:
    # 02:30 UTC = 08:00 IST: notices and removals of idle accounts (21-day policy)
    scheduler.register("lifecycle", _lifecycle, every="daily", at_utc="02:30")
    try:
        from jobs.content_job import run as _content
        scheduler.register("content", _content, every="daily", at_utc="20:30")          # 02:00 IST, off-peak
    except ImportError:
        pass
    try:
        from jobs.social_job import run_linkedin as _linkedin
        scheduler.register("linkedin", _linkedin, every="weekly", at_utc="04:00", days=[0, 2, 4])   # Mon/Wed/Fri 09:30 IST
    except ImportError:
        pass
