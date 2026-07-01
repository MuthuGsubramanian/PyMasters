"""
streaks.py -- Daily learning-streak maintenance.

Background / why this exists
----------------------------
The ``user_streaks`` table (created in main.py) is *read* in many places — the
streak leaderboard (``/api/leaderboard/global?scope=streak``), profile stats,
the member profile card, and the ``streak_7`` ("Consistent Learner") achievement
— but until now **no production code path ever wrote to it**. As a result every
real user's ``current_streak`` was permanently 0: the streak leaderboard showed
all zeros, the 7-day-streak achievement was unreachable, and profile streak
always read 0.

``touch_streak`` is the single, shared place that records "the user did a
learning activity today" and advances their streak. It is intentionally
dependency-free (stdlib only) so it can be imported from both ``main.py`` and
``routes/*`` without creating an import cycle.

Production-safety
-----------------
* Purely additive: it only writes the ``user_streaks`` row, a table that was
  previously always 0/absent for real users. No existing API shape, column, or
  flow changes.
* Idempotent within a calendar day: calling it many times on the same date does
  not advance ``current_streak`` again, so wiring it into multiple activity
  endpoints is safe.
* Never raises into the caller: any error is swallowed and ``None`` returned, so
  a streak-write failure can never break XP award / lesson completion. Callers
  may still wrap defensively; this is belt-and-suspenders.
* The caller owns the transaction — ``touch_streak`` issues the INSERT/UPDATE on
  the supplied connection but does **not** commit; the existing flow's
  ``conn.commit()`` persists it atomically with the completion record.
"""

from datetime import date, timedelta


def effective_current_streak(stored, last_active_date, today=None):
    """Return the *display-accurate* current streak for a read path.

    Why this exists
    ---------------
    ``touch_streak`` only runs when a user does a learning activity, so the
    stored ``current_streak`` is correct on the day it was written but then
    *decays silently*: a user who built a 7-day streak and then skips two days
    still has ``current_streak = 7`` in the row until their NEXT activity (which
    resets it to 1). Every read path that trusts the raw value therefore
    OVER-REPORTS a lapsed streak as if it were still live (e.g. the Dashboard
    "day streak" badge showing 7 for someone who broke it days ago). This helper
    applies the same lapse rule ``touch_streak`` uses on write — a streak is only
    "live" while the last active date is today or yesterday; once there is a gap
    of 2+ days the streak is broken and the effective value is 0 — WITHOUT
    mutating stored data (purely a read-time correction, fully reversible).

    Args:
        stored: the raw ``current_streak`` value read from ``user_streaks``.
        last_active_date: the row's ``last_active_date`` (ISO ``YYYY-MM-DD``) or
            ``None``.
        today: optional ISO date string to treat as "today"; defaults to the
            server's local date, matching ``touch_streak``.

    Returns:
        ``stored`` (coerced to int, floored at 0) when the streak is still live,
        otherwise ``0``. Never raises — on any unexpected input it falls back to
        the stored value so a read path is never broken by this helper.
    """
    try:
        s = int(stored or 0)
        if s <= 0:
            return 0
        if not last_active_date:
            return 0
        today = today or date.today().isoformat()
        last = str(last_active_date).strip().split(" ")[0].split("T")[0]
        yesterday = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
        if last == today or last == yesterday:
            return s
        return 0
    except Exception:
        # Defensive: never let a display-only correction break the endpoint.
        try:
            return max(0, int(stored or 0))
        except Exception:
            return 0


def touch_streak(conn, user_id, today=None):
    """Record daily learning activity for ``user_id`` and advance their streak.

    Rules (standard daily-streak semantics):
      * First ever activity, or a gap of 2+ days since last activity → streak = 1.
      * Activity exactly one day after the last active date → streak += 1.
      * Activity again on a day already counted → no change (idempotent).
    ``longest_streak`` is kept as the running maximum.

    Args:
        conn: an open sqlite3 connection (caller commits).
        user_id: the user whose streak to touch.
        today: optional ISO date string (``YYYY-MM-DD``) to treat as "today";
            defaults to the server's current local date. Mainly for testing.

    Returns:
        The user's ``current_streak`` after the update, or ``None`` if anything
        went wrong (the caller's flow is never disrupted).
    """
    if not user_id:
        return None
    try:
        today = today or date.today().isoformat()

        row = conn.execute(
            "SELECT current_streak, longest_streak, last_active_date "
            "FROM user_streaks WHERE user_id = ?",
            [user_id],
        ).fetchone()

        if row is None:
            cur, longest, last = 0, 0, None
        else:
            # Works for both sqlite3.Row and plain tuples.
            cur = (row[0] or 0)
            longest = (row[1] or 0)
            last = row[2]

        # Already counted activity for today — nothing to advance.
        if last == today:
            return cur

        yesterday = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
        cur = (cur + 1) if last == yesterday else 1
        longest = max(longest or 0, cur)

        if row is None:
            conn.execute(
                "INSERT INTO user_streaks "
                "(user_id, current_streak, longest_streak, last_active_date) "
                "VALUES (?, ?, ?, ?)",
                [user_id, cur, longest, today],
            )
        else:
            conn.execute(
                "UPDATE user_streaks SET current_streak = ?, longest_streak = ?, "
                "last_active_date = ? WHERE user_id = ?",
                [cur, longest, today, user_id],
            )
        return cur
    except Exception:
        return None
