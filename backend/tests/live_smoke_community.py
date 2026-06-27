"""Live smoke test (real uvicorn + HTTP) for community/competition/OAuth features."""
import os, sys, time, json, socket, sqlite3, subprocess, tempfile, signal
import requests
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def _free_port():
    s=socket.socket(); s.bind(("127.0.0.1",0)); p=s.getsockname()[1]; s.close(); return p
def main():
    port=_free_port()
    fd,db=tempfile.mkstemp(suffix=".db"); os.close(fd); os.remove(db)
    env=dict(os.environ); env["DB_PATH"]=db; env["JWT_SECRET"]="live-test-secret-long-enough-1234567"
    env.pop("K_SERVICE",None); env.pop("LINKEDIN_CLIENT_ID",None)
    proc=subprocess.Popen([sys.executable,"-m","uvicorn","main:app","--port",str(port),"--host","127.0.0.1"],
        cwd=BACKEND,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    base=f"http://127.0.0.1:{port}"; checks=[]
    def check(n,c,e=""):
        checks.append((n,bool(c))); print(("  PASS " if c else "  FAIL ")+n+(f"  [{e}]" if e and not c else ""))
    try:
        for _ in range(80):
            try:
                if requests.get(base+"/",timeout=1).status_code==200: break
            except Exception: time.sleep(0.25)
        else:
            print("NO START"); print(proc.stdout.read().decode(errors="ignore")[-3000:]); return 1
        time.sleep(1.0)
        def reg(u,n):
            j=requests.post(base+"/api/auth/register",json={"username":u,"password":"Passw0rd!","name":n,"account_type":"individual","email":f"{u}@e.com"},timeout=10).json()
            return j["id"],j["token"]
        def H(t): return {"Authorization":f"Bearer {t}"}
        print("\n[1] Registration"); a_id,a=reg("alice","Alice"); b_id,b=reg("bob","Bob"); c_id,c=reg("carol","Carol")
        check("register 3",all([a_id,b_id,c_id]))
        conn=sqlite3.connect(db)
        conn.execute("UPDATE users SET points=? WHERE id=?",[1500,a_id]); conn.execute("UPDATE users SET points=? WHERE id=?",[600,b_id]); conn.execute("UPDATE users SET points=? WHERE id=?",[80,c_id])
        conn.execute("INSERT INTO user_streaks (user_id,current_streak,longest_streak,last_active_date) VALUES (?,?,?,date('now'))",[b_id,9,9])
        conn.commit(); conn.close()
        print("\n[2] Global XP leaderboard")
        r=requests.get(base+"/api/leaderboard/global",params={"scope":"xp"},headers=H(b),timeout=10).json()
        check("order alice>bob>carol",[x["username"] for x in r["leaderboard"][:3]]==["alice","bob","carol"])
        check("bob me.rank==2",r["me"] and r["me"]["rank"]==2)
        check("alice tier Advanced",r["leaderboard"][0]["tier"]=="Advanced")
        print("\n[3] Streak leaderboard")
        r=requests.get(base+"/api/leaderboard/global",params={"scope":"streak"},headers=H(b),timeout=10).json()
        check("bob top streak",r["leaderboard"][0]["username"]=="bob")
        print("\n[4] Directory + profile")
        r=requests.get(base+"/api/members",params={"q":"car"},headers=H(a),timeout=10).json()
        check("search finds carol (q=car)","carol" in {m["username"] for m in r["members"]})
        r=requests.get(base+f"/api/members/{b_id}",headers=H(a),timeout=10).json()
        check("profile bob",r["username"]=="bob")
        print("\n[5] Connections")
        check("follow",requests.post(base+f"/api/connections/{b_id}",headers=H(a),timeout=10).json()["following"] is True)
        r=requests.get(base+f"/api/connections/{a_id}",params={"kind":"following"},headers=H(a),timeout=10).json()
        check("following has bob",any(p["username"]=="bob" for p in r["people"]))
        check("no self-follow",requests.post(base+f"/api/connections/{a_id}",headers=H(a),timeout=10).status_code==400)
        check("unfollow",requests.delete(base+f"/api/connections/{b_id}",headers=H(a),timeout=10).json()["following"] is False)
        print("\n[6] /api/auth/me")
        me=requests.get(base+"/api/auth/me",headers=H(a),timeout=10).json()
        check("me returns alice session",me["username"]=="alice" and "unlocked" in me)
        print("\n[7] Org competitions")
        org=requests.post(base+"/api/org",json={"name":"Hogwarts","type":"school","user_id":a_id},headers=H(a),timeout=10).json(); org_id=org["id"]
        check("org super_admin",org["role"]=="super_admin")
        conn=sqlite3.connect(db)
        for uid in (b_id,c_id): conn.execute("INSERT INTO org_members (org_id,user_id,role,joined_at) VALUES (?,?,'member',datetime('now'))",[org_id,uid])
        conn.execute("INSERT INTO org_member_groups (org_id,user_id,group_name) VALUES (?,?,?)",[org_id,b_id,"Section-A"]); conn.commit(); conn.close()
        cat=requests.get(base+"/api/org/challenges/catalog",headers=H(a),timeout=10).json(); check("catalog",len(cat["challenges"])>=3)
        pick=[cat["challenges"][0]["id"],cat["challenges"][1]["id"]]
        cs=requests.post(base+f"/api/org/{org_id}/challenges",json={"title":"Week 1","challenge_ids":pick,"group_name":""},headers=H(a),timeout=10).json(); set_id=cs["id"]
        check("set created",cs["challenge_count"]==2)
        check("member cannot create",requests.post(base+f"/api/org/{org_id}/challenges",json={"title":"x","challenge_ids":pick},headers=H(c),timeout=10).status_code==403)
        conn=sqlite3.connect(db); conn.execute("INSERT INTO challenge_submissions (user_id,challenge_id,code,passed,xp_awarded) VALUES (?,?,?,1,10)",[b_id,pick[0],"print(1)"]); conn.commit(); conn.close()
        r=requests.get(base+f"/api/org/{org_id}/challenges/{set_id}/leaderboard",headers=H(b),timeout=10).json()
        check("set leaderboard bob 1/2",r["leaderboard"] and r["leaderboard"][0]["solved"]==1)
        r=requests.get(base+f"/api/org/{org_id}/challenges",headers=H(b),timeout=10).json()
        check("bob sees competition",r["count"]==1 and r["challenge_sets"][0]["my_completed"]==1)
        r=requests.get(base+f"/api/org/{org_id}/leaderboard",headers=H(c),timeout=10).json()
        check("org leaderboard alice top",r["leaderboard"][0]["user_id"]==a_id)
        r=requests.get(base+f"/api/org/{org_id}/leaderboard",params={"group":"Section-A"},headers=H(a),timeout=10).json()
        check("group leaderboard only bob",[m["user_id"] for m in r["leaderboard"]]==[b_id])
        print("\n[7b] Topic search + generate")
        rs=requests.get(base+"/api/classroom/search",params={"q":"variable","user_id":a_id},timeout=10).json()
        check("search returns results for known topic", rs["count"]>=1, str(rs.get("count")))
        rn=requests.get(base+"/api/classroom/search",params={"q":"zzqwlibautotelic","user_id":a_id},timeout=10).json()
        check("unknown topic -> can_generate", rn["can_generate"] is True and rn["count"]==0)
        rg=requests.post(base+"/api/classroom/generate",json={"topic":"Quantum Decorators","level":"beginner","focus":"examples","user_id":a_id},timeout=10).json()
        check("generate queues job", rg.get("status")=="queued" and bool(rg.get("job_id")))
        print("\n[8] LinkedIn gated off")
        check("linkedin disabled",requests.get(base+"/api/auth/linkedin/config",timeout=10).json()["enabled"] is False)
        check("linkedin start 503",requests.get(base+"/api/auth/linkedin/start",timeout=10).status_code==503)
        print("\n[9] Regression")
        check("password login",requests.post(base+"/api/auth/login",json={"username":"alice","password":"Passw0rd!"},timeout=10).status_code==200)
        check("legacy leaderboard",requests.get(base+"/api/challenges/leaderboard",timeout=10).status_code==200)
    finally:
        proc.send_signal(signal.SIGTERM)
        try: proc.wait(timeout=5)
        except Exception: proc.kill()
        try: os.remove(db)
        except Exception: pass
    p=sum(1 for _,ok in checks if ok); t=len(checks)
    print(f"\n==== LIVE: {p}/{t} passed ====")
    return 0 if p==t else 1
if __name__=="__main__": sys.exit(main())
