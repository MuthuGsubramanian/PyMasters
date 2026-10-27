"""Live API smoke across backend modules, as the ops learner (vault service token).

Usage: python ops/e2e/api_smoke.py [--base https://pymasters.net]
Exercises: health, profile/stats, classroom lesson + evaluate (real sandbox grade),
playground execute, review due, semantic search, trending, challenges, leaderboard,
play catalog, learner notes. Prints a table of status + latency and a non-zero exit on
any failure or a call slower than 8 s.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops"))
sys.path.insert(0, str(ROOT))
import pm_admin  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("PYMASTERS_API", "https://pymasters.net"))
    args = ap.parse_args()
    pm_admin.BASE = args.base.rstrip("/")
    pm_admin.load_secrets()
    tok = pm_admin.admin_session()
    import base64
    uid = json.loads(base64.urlsafe_b64decode(tok.split(".")[1] + "==="))["sub"]

    checks = [
        ("health", "GET", "/health", None, lambda r: r.get("status") == "ok"),
        ("profile", "GET", f"/api/profile/{uid}", None, lambda r: isinstance(r, dict) and "profile" in r),
        ("stats", "GET", f"/api/profile/{uid}/stats", None, lambda r: "total_xp" in r),
        ("achievements", "GET", f"/api/profile/{uid}/achievements", None, lambda r: isinstance(r, (list, dict))),
        ("learner_notes", "GET", f"/api/profile/{uid}/learner-notes", None, lambda r: "notes" in r),
        ("lesson", "GET", "/api/classroom/lesson/variables_intro", None, lambda r: r.get("id") == "variables_intro" or "title" in r),
        ("evaluate_pass", "POST", "/api/classroom/evaluate",
         {"user_id": uid, "code": 'name = "Kittu"\nage = 25\nprint(f"{name} is {age}")', "expected_output": "Kittu is 25",
          "lesson_id": "variables_intro", "topic": "variables", "attempt_count": 1}, lambda r: "success" in r),
        ("playground_execute", "POST", "/api/playground/execute", {"code": "print(sum(range(10)))"}, lambda r: (r.get("output") or "").strip() == "45"),
        ("review_due", "GET", f"/api/review/due?user_id={uid}", None, lambda r: "due" in r),
        ("semantic_search", "GET", "/api/semantic/search?q=stop%20my%20loop%20running%20forever&limit=3", None, lambda r: isinstance(r, (list, dict))),
        ("trending", "GET", "/api/trending", None, lambda r: isinstance(r, (list, dict))),
        ("challenges", "GET", "/api/challenges/weekly", None, lambda r: isinstance(r, (list, dict))),
        ("leaderboard", "GET", "/api/leaderboard/global?scope=xp&limit=5", None, lambda r: isinstance(r, (list, dict))),
        ("play_catalog", "GET", "/api/play/catalog", None, lambda r: r.get("enabled") is True and len(r.get("games", [])) == 6),
        ("semantic_search_warm", "GET", "/api/semantic/search?q=list%20comprehension&limit=3", None, lambda r: isinstance(r, (list, dict))),
        ("knowledge_map", "GET", f"/api/graph/user-map/{uid}", None, lambda r: isinstance(r, (list, dict))),
    ]
    failures = []
    print(f"{'check':20} {'status':7} {'secs':>5}  note")
    for name, method, path, body, ok in checks:
        t0 = time.time()
        try:
            st, out = pm_admin._request(method, path, body, tok)
        except Exception as exc:  # noqa: BLE001
            st, out = 0, str(exc)
        secs = time.time() - t0
        good = st == 200 and (ok(out) if isinstance(out, (dict, list)) else False)
        note = "" if good else (json.dumps(out)[:100] if not isinstance(out, str) else out[:100])
        if not good:
            failures.append((name, st, note))
        if secs > 8:
            failures.append((name, st, f"slow {secs:.1f}s"))
        print(f"{name:20} {st:<7} {secs:5.2f}  {note}")
    print("FAILURES:", failures if failures else "none")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
