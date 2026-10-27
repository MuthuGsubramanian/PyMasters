"""Live smoke for the Arcade API as the ops user.

    python ops/e2e/arcade_smoke.py [--base https://pymasters.net]

Checks: catalog shape + unlock state, a session per unlocked game (start → answer two items →
finish), idempotent finish, locked-game refusal, and that unlock notifications exist. Answers are
deliberate guesses (choice 0 / bin 0) because answer keys never leave the server; the check is the
contract, not the score. Exit 0 when every check passes.
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pm_admin  # noqa: E402

CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail else ""))


def guess(item):
    if item.get("kind") == "line_then_choice":
        return [0, 0]
    if item.get("kind") == "bin":
        return (item.get("choices") or ["list"])[0]
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("PYMASTERS_BASE", "https://pymasters.net"))
    args = ap.parse_args()
    pm_admin.BASE = args.base.rstrip("/")
    pm_admin.load_secrets()
    tok = pm_admin.admin_session()
    import base64, json as _json
    me = _json.loads(base64.urlsafe_b64decode(tok.split(".")[1] + "==="))["sub"]
    get = lambda p: pm_admin._request("GET", p, None, tok)          # noqa: E731
    post = lambda p, b: pm_admin._request("POST", p, b, tok)       # noqa: E731

    st, cat = get("/api/arcade/catalog")
    check("catalog 200", st == 200, str(st))
    games = {g["id"]: g for g in (cat.get("games") or [])} if isinstance(cat, dict) else {}
    check("catalog lists three games", set(games) == {"snakes_ladders", "linked_snake", "code_slingshot"}, ",".join(games))
    check("catalog stage present", isinstance(cat.get("stage"), dict) and "completed" in cat["stage"])
    for gid, g in games.items():
        check(f"{gid} has milestone/pool fields", all(k in g for k in ("unlocked", "milestone", "pool", "needs_content")))
    sl = games.get("snakes_ladders") or {}
    check("snakes_ladders lists boards", isinstance(sl.get("boards"), list) and len(sl["boards"]) == 8)

    # locked game refuses
    locked = [gid for gid, g in games.items() if not g["unlocked"]]
    if locked:
        st, body = post("/api/arcade/session/start", {"game_id": locked[0]})
        check(f"locked {locked[0]} refused", st == 403, str(st))

    for gid, g in games.items():
        if not g["unlocked"]:
            continue
        if g.get("needs_content"):
            st, body = post("/api/arcade/session/start", {"game_id": gid, **({"board": next((b["key"] for b in sl["boards"] if b["unlocked"]), None)} if gid == "snakes_ladders" else {})})
            check(f"{gid} needs_content -> 409", st == 409, str(st))
            continue
        body = {"game_id": gid}
        if gid == "snakes_ladders":
            b = next((b for b in sl["boards"] if b["unlocked"] and b["pool"] >= 12), None)
            if not b:
                check("snakes_ladders has a playable board", False)
                continue
            body["board"] = b["key"]
        st, sess = post("/api/arcade/session/start", body)
        check(f"{gid} session start", st == 200 and sess.get("session_id") and sess.get("items"), str(st))
        if st != 200:
            continue
        items = sess["items"]
        check(f"{gid} items are public", all("answer" not in i and "why" not in i for i in items))
        reveals = []
        for it in items[:2]:
            st, rev = post("/api/arcade/session/answer", {"session_id": sess["session_id"], "item_id": it["id"], "response": guess(it), "ms": 2100})
            check(f"{gid} answer graded", st == 200 and "correct" in rev and "why" in rev and "lesson_id" in rev, str(st))
            reveals.append(rev)
        st, again = post("/api/arcade/session/answer", {"session_id": sess["session_id"], "item_id": items[0]["id"], "response": 3, "ms": 1})
        check(f"{gid} answer idempotent", st == 200 and again == reveals[0])
        st, fin = post("/api/arcade/session/finish", {"session_id": sess["session_id"], "score": 42})
        check(f"{gid} finish", st == 200 and fin.get("answered") == 2 and "xp" in fin and "xp_capped" in fin, str(st))
        st, fin2 = post("/api/arcade/session/finish", {"session_id": sess["session_id"], "score": 1})
        check(f"{gid} finish idempotent", st == 200 and fin2 == fin)
        if gid == "linked_snake":
            st, more = post("/api/arcade/session/questions", {"session_id": sess["session_id"]})
            check("questions after finish -> 409", st == 409, str(st))

    st, notes = get(f"/api/notifications?user_id={me}&limit=20")
    if st == 200 and isinstance(notes, dict):
        kinds = [n.get("type") for n in (notes.get("notifications") or [])]
        check("unlock notification present", "game_unlocked" in kinds, ",".join(kinds[:5]))

    failed = [c for c in CHECKS if not c[1]]
    print(f"\n{len(CHECKS) - len(failed)}/{len(CHECKS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
