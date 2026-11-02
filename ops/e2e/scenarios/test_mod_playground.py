"""Module: playground — run, trace, files, Vaathiyaar chat stream (spec §3)."""
from conftest import BASE, api, create_user


def test_run_and_trace(logged_in_page):
    u = create_user()
    s = api(u["ip"], u["token"])
    run = s.post(f"{BASE}/api/playground/execute", json={"code": "print(2+3)"}, timeout=60).json()
    assert run["output"].strip() == "5", run
    trace = s.post(f"{BASE}/api/playground/trace", json={"code": "x = 2\nprint(x + 3)"}, timeout=60).json()
    assert len(trace["steps"]) >= 1 and trace["stdout"].strip() == "5", trace

    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/playground", wait_until="networkidle")
    page.locator(".cm-content").first.wait_for(timeout=30000)
    assert not [p for p in page.problems if "pageerror" in p], page.problems[:3]


def test_file_create_rename_delete():
    u = create_user()
    s = api(u["ip"], u["token"])
    f = s.post(f"{BASE}/api/playground/files", json={"name": "scratch.py", "code": "print('hi')"}, timeout=30)
    assert f.status_code == 200, f.text[:200]
    fid = f.json().get("id") or f.json()["file"]["id"]
    assert s.put(f"{BASE}/api/playground/files/{fid}", json={"name": "renamed.py"}, timeout=30).status_code == 200
    names = {x["name"] for x in s.get(f"{BASE}/api/playground/files", timeout=30).json()["files"]}
    assert "renamed.py" in names and "scratch.py" not in names, names
    assert s.delete(f"{BASE}/api/playground/files/{fid}", timeout=30).status_code == 200
    assert fid not in {x["id"] for x in s.get(f"{BASE}/api/playground/files", timeout=30).json()["files"]}


def test_chat_stream_returns_stub_text():
    u = create_user()
    r = api(u["ip"], u["token"]).post(f"{BASE}/api/playground/chat/stream", timeout=60, stream=True,
                                      json={"user_id": u["id"], "message": "What does print do?"})
    assert r.status_code == 200, r.text[:200]
    body = b"".join(r.iter_content(None)).decode()
    assert "Stub" in body and "tutor" in body, body[:300]
