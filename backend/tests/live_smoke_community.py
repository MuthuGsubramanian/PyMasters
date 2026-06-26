"""
Live smoke test for the community / competition / OAuth features.

This is NOT a unit test — it boots the real FastAPI app under uvicorn on a fresh
temp DB and exercises every new endpoint over real HTTP, asserting behaviour.

Run:  python tests/live_smoke_community.py
Exit code 0 = all live checks passed.
"""
import os, sys, time, json, socket, sqlite3, subprocess, tempfile, signal

import requests

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def main():
    port = _free_port()
    db_fd, db_path = tempfile.mkstemp(suffix=".db"); os.close(db_fd); os.remove(db_path)
    env = dict(os.environ)
    env["DB_PATH"] = db_path
    env["JWT_SECRET"] = "live-test-secret-which-is-long-enough-12345"
    env.pop("K_SERVICE", None)            # ensure non-production
    env.pop("LINKEDIN_CLIENT_ID", None)   # ensure LinkedIn shows as disabled

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--port", str(port), "--host", "127.0.0.1"],
        cwd=BACKEND, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    checks = []

    def check(name, cond, extra=""):
        checks.append((name, bool(cond), extra))
        print(("  PASS " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))

    try:
        # wait for server
        for _ in range(80):
            try:
                if requests.get(base + "/", timeout=1).status_code == 200:
                    break
            except Exception:
                time.sleep(0.25)
        else:
            print("SERVER DID NOT START")
            print(proc.stdout.read().decode(errors="ignore")[-3000:])
            return 1
        time.sleep(1.0)  # let init_db thread finish

        def reg(username, name):
            r = requests.post(base + "/api/auth/register",
                              json={"username": username, "password": "Passw0rd!", "name": name,
                                    "account_type": "individual", "email": f"{username}@example.com"},
                              timeout=10)
            j = r.json(); return j["id"], j["token"]

        def H(tok): return {"Authorization": f"Bearer {tok}"}

        print("\n[1] Auth / registration")
        alice_id, alice = reg("alice", "Alice Admin")
        bob_id, bob = reg("bob", "Bob Builder")
        carol_id, carol = reg("carol", "Carol Coder")
        check("register 3 users", all([alice_id, bob_id, carol_id]))

        # Seed deterministic XP + streaks directly in DB
        conn = sqlite3.connect(db_path)
        conn.execute("UPDATE users SET points=? WHERE id=?", [1500, alice_id])
        conn.execute("UPDATE users SET points=? WHERE id=?", [600, bob_id])
        conn.execute("UPDATE users SET points=? WHERE id=?", [80, carol_id])
        conn.execute("INSERT INTO user_streaks (user_id,current_streak,longest_streak,last_active_date) VALUES (?,?,?,date('now'))",
                     [bob_id, 9, 9])
        conn.execute("INSERT INTO user_streaks (user_id,current_streak,longest_streak,last_active_date) VALUES (?,?,?,date('now'))",
                     [alice_id, 3, 5])
        conn.commit(); conn.close()

        print("\n[2] Global leaderboard (XP)")
        r = requests.get(base + "/api/leaderboard/global", params={"scope": "xp"}, headers=H(bob), timeout=10).json()
        lb = r["leaderboard"]
        check("xp leaderboard ordered alice>bob>carol",
              [x["username"] for x in lb[:3]] == ["alice", "bob", "carol"],
              str([x["username"] for x in lb[:3]]))
        check("bob 'me' rank == 2", r["me"] and r["me"]["rank"] == 2, json.dumps(r.get("me")))
        check("tier computed for alice (Advanced @1500)", lb[0]["tier"] == "Advanced", lb[0]["tier"])

        print("\n[3] Global leaderboard (streak)")
        r = requests.get(base + "/api/leaderboard/global", params={"scope": "streak"}, headers=H(bob), timeout=10).json()
        check("streak leaderboard top is bob (streak 9)", r["leaderboard"][0]["username"] == "bob",
              r["leaderboard"][0]["username"])

        print("\n[4] Member directory + public profile")
        r = requests.get(base + "/api/members", params={"q": "co"}, headers=H(alice), timeout=10).json()
        names = {m["username"] for m in r["members"]}
        check("directory search 'co' finds carol", "carol" in names, str(names))
        r = requests.get(base + f"/api/members/{bob_id}", headers=H(alice), timeout=10).json()
        check("member profile returns bob", r["username"] == "bob" and r["is_following"] is False)

        print("\n[5] Connections (follow / unfollow)")
        r = requests.post(base + f"/api/connections/{bob_id}", headers=H(alice), timeout=10).json()
        check("alice follows bob", r["following"] is True and r["target_followers"] == 1)
        r = requests.get(base + f"/api/connections/{alice_id}", params={"kind": "following"}, headers=H(alice), timeout=10).json()
        check("alice following list has bob", any(p["username"] == "bob" for p in r["people"]))
        r = requests.get(base + f"/api/connections/{bob_id}", params={"kind": "followers"}, headers=H(bob), timeout=10).json()
        check("bob followers list has alice", any(p["username"] == "alice" for p in r["people"]))
        r = requests.post(base + f"/api/connections/{alice_id}", headers=H(alice), timeout=10)
        check("cannot follow self -> 400", r.status_code == 400, str(r.status_code))
        r = requests.delete(base + f"/api/connections/{bob_id}", headers=H(alice), timeout=10).json()
        check("alice unfollows bob", r["following"] is False and r["target_followers"] == 0)

        print("\n[6] Org creation + competitive challenges")
        org = requests.post(base + "/api/org", json={"name": "Hogwarts CS", "type": "school", "user_id": alice_id},
                            headers=H(alice), timeout=10).json()
        org_id = org["id"]
        check("org created, alice super_admin", org["role"] == "super_admin")
        # add bob + carol as members, bob into group 'Section-A'
        conn = sqlite3.connect(db_path)
        for uid in (bob_id, carol_id):
            conn.execute("INSERT INTO org_members (org_id,user_id,role,joined_at) VALUES (?,?,'member',datetime('now'))", [org_id, uid])
        conn.execute("INSERT INTO org_member_groups (org_id,user_id,group_name) VALUES (?,?,?)", [org_id, bob_id, "Section-A"])
        conn.commit(); conn.close()

        cat = requests.get(base + "/api/org/challenges/catalog", headers=H(alice), timeout=10).json()
        check("catalog returns challenges", len(cat["challenges"]) >= 3, str(len(cat["challenges"])))
        pick = [cat["challenges"][0]["id"], cat["challenges"][1]["id"]]

        cs = requests.post(base + f"/api/org/{org_id}/challenges",
                           json={"title": "Week 1 Sprint", "description": "Warm up", "challenge_ids": pick,
                                 "group_name": ""}, headers=H(alice), timeout=10).json()
        set_id = cs["id"]
        check("challenge set created (2 challenges)", cs["challenge_count"] == 2)

        # member cannot create (carol is member) -> 403
        r = requests.post(base + f"/api/org/{org_id}/challenges",
                          json={"title": "Nope", "challenge_ids": pick}, headers=H(carol), timeout=10)
        check("member cannot create competition -> 403", r.status_code == 403, str(r.status_code))

        # bob 'passes' one assigned challenge (seed submission)
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO challenge_submissions (user_id, challenge_id, code, passed, xp_awarded) "
            "VALUES (?,?,?,1,10)", [bob_id, pick[0], "print(1)"])
        conn.commit(); conn.close()

        r = requests.get(base + f"/api/org/{org_id}/challenges/{set_id}/leaderboard", headers=H(bob), timeout=10).json()
        check("competition leaderboard shows bob solved 1/2",
              r["leaderboard"] and r["leaderboard"][0]["solved"] == 1 and r["leaderboard"][0]["total"] == 2,
              json.dumps(r["leaderboard"][:1]))

        r = requests.get(base + f"/api/org/{org_id}/challenges", headers=H(bob), timeout=10).json()
        check("bob sees the active competition (my_completed=1)",
              r["count"] == 1 and r["challenge_sets"][0]["my_completed"] == 1, json.dumps(r.get("count")))

        r = requests.get(base + f"/api/org/{org_id}/leaderboard", headers=H(carol), timeout=10).json()
        check("org leaderboard visible to member, ranks by XP (alice top)",
              r["leaderboard"][0]["user_id"] == alice_id, r["leaderboard"][0]["user_id"])

        # group-scoped leaderboard
        r = requests.get(base + f"/api/org/{org_id}/leaderboard", params={"group": "Section-A"},
                         headers=H(alice), timeout=10).json()
        check("group leaderboard Section-A contains only bob",
              [m["user_id"] for m in r["leaderboard"]] == [bob_id], str([m["user_id"] for m in r["leaderboard"]]))

        print("\n[7] LinkedIn OAuth (config-gated, disabled here)")
        r = requests.get(base + "/api/auth/linkedin/config", timeout=10).json()
        check("linkedin config reports disabled (no env)", r["enabled"] is False)
        r = requests.get(base + "/api/auth/linkedin/start", timeout=10)
        check("linkedin start -> 503 when unconfigured", r.status_code == 503, str(r.status_code))

        print("\n[8] Regression: existing auth + challenge leaderboard still work")
        r = requests.post(base + "/api/auth/login", json={"username": "alice", "password": "Passw0rd!"}, timeout=10)
        check("password login still works", r.status_code == 200 and "token" in r.json())
        r = requests.get(base + "/api/challenges/leaderboard", timeout=10)
        check("legacy /challenges/leaderboard still 200", r.status_code == 200)

    finally:
        proc.send_signal(signal.SIGTERM)
        try: proc.wait(timeout=5)
        except Exception: proc.kill()
        try: os.remove(db_path)
        except Exception: pass

    passed = sum(1 for _, ok, _ in checks if ok)
    total = len(checks)
    print(f"\n==== LIVE RESULTS: {passed}/{total} passed ====")
    if passed != total:
        print("FAILURES:")
        for n, ok, extra in checks:
            if not ok:
                print(f"  - {n}  {extra}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
