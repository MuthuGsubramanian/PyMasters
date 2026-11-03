"""Module: learning paths — start, progress reflects a completion, switch (spec §3)."""
from conftest import BASE, api, complete_lesson, create_user


def test_start_progress_and_switch():
    u = create_user()
    s = api(u["ip"], u["token"])
    paths = s.get(f"{BASE}/api/paths/", timeout=30).json()["paths"]
    assert len(paths) >= 2, paths
    first = next(p for p in paths if p["id"] == "python_zero_to_hero")
    other = next(p for p in paths if p["id"] != first["id"])

    assert s.get(f"{BASE}/api/paths/{first['id']}/progress", params={"user_id": u["id"]}, timeout=30).json() is None
    r = s.post(f"{BASE}/api/paths/{first['id']}/start", json={"user_id": u["id"]}, timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "active", r.text[:200]

    assert complete_lesson(u, "variables_intro")["success"] is True
    prog = s.get(f"{BASE}/api/paths/{first['id']}/progress", params={"user_id": u["id"]}, timeout=30).json()
    assert "variables_intro" in prog["completed_lessons"] and prog["completed_count"] >= 1, prog

    sw = s.post(f"{BASE}/api/paths/{other['id']}/switch", json={"user_id": u["id"]}, timeout=30)
    assert sw.status_code == 200, sw.text[:200]
    active = s.get(f"{BASE}/api/paths/active", params={"user_id": u["id"]}, timeout=30).json()["active_paths"]
    assert [p.get("path_id", p.get("id")) for p in active] == [other["id"]], active
