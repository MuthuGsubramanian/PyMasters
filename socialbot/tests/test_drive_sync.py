"""Tests for Google Drive backup & sync of generated posts, shorts, and videos."""
import re

import pytest

from socialbot import config
from socialbot.publish import drive


class _Exec:
    def __init__(self, payload):
        self._payload = payload

    def execute(self):
        return self._payload


class _FakeFiles:
    def __init__(self, service):
        self.svc = service

    def list(self, q="", spaces="drive", fields="", pageSize=50):
        name_m = re.search(r"name='([^']+)'", q)
        parent_m = re.search(r"'([^']+)' in parents", q)
        want_folder = "mimeType='application/vnd.google-apps.folder'" in q
        want_non_folder = "mimeType!='application/vnd.google-apps.folder'" in q
        out = []
        for f in self.svc.files_db.values():
            if name_m and f["name"] != name_m.group(1):
                continue
            if parent_m and parent_m.group(1) not in (f.get("parents") or []):
                continue
            is_folder = f["mimeType"] == "application/vnd.google-apps.folder"
            if want_folder and not is_folder:
                continue
            if want_non_folder and is_folder:
                continue
            out.append({"id": f["id"], "name": f["name"]})
        return _Exec({"files": out[:pageSize]})

    def create(self, body=None, media_body=None, fields="id"):
        self.svc.seq += 1
        fid = f"gd_{self.svc.seq}"
        rec = {
            "id": fid,
            "name": body["name"],
            "mimeType": body.get("mimeType") or getattr(media_body, "_mimetype", "application/octet-stream"),
            "parents": list(body.get("parents") or []),
            "appProperties": dict(body.get("appProperties") or {}),
            "updates": 0,
        }
        self.svc.files_db[fid] = rec
        self.svc.created.append((fid, rec["name"], rec["parents"]))
        return _Exec({"id": fid})

    def update(self, fileId, media_body=None, fields="id"):
        rec = self.svc.files_db[fileId]
        rec["updates"] += 1
        self.svc.updated.append((fileId, rec["name"]))
        return _Exec({"id": fileId})


class _FakeDriveService:
    def __init__(self, email="muthu.g.subramanian@gmail.com"):
        self.email = email
        self.seq = 0
        self.files_db = {}
        self.created = []
        self.updated = []

    def about(self):
        email = self.email
        return type("_About", (), {"get": lambda self, fields="": _Exec({"user": {"emailAddress": email}})})()

    def files(self):
        return _FakeFiles(self)


def test_sync_all_organizes_posts_shorts_and_videos_and_is_idempotent(tmp_path, monkeypatch):
    # Create fake media files for a Post, a Short, and a Long Video
    (tmp_path / "post_dir").mkdir()
    (tmp_path / "post_dir/loop.gif").write_bytes(b"GIF89a_fake")
    (tmp_path / "post_dir/loop.mp4").write_bytes(b"mp4_post_fake")

    (tmp_path / "short_dir").mkdir()
    (tmp_path / "short_dir/video.mp4").write_bytes(b"mp4_short_fake")
    (tmp_path / "short_dir/thumb.jpg").write_bytes(b"jpg_short_fake")
    (tmp_path / "short_dir/captions.srt").write_text("1\n00:00:00,000 --> 00:00:02,000\nHello\n")

    (tmp_path / "long_dir").mkdir()
    (tmp_path / "long_dir/video.mp4").write_bytes(b"mp4_long_fake")
    (tmp_path / "long_dir/thumb.jpg").write_bytes(b"jpg_long_fake")
    (tmp_path / "long_dir/captions.srt").write_text("1\n00:00:00,000 --> 00:00:03,000\nIntro\n")

    rows = [
        {
            "id": 10, "kind": "linkedin", "source_key": "lesson:python_fundamentals/variables",
            "topic": "Variables Made Simple", "status": "published", "score": 8.5,
            "created_at": "2026-11-12T10:00:00+00:00", "publish_at": "2026-11-12T11:00:00+00:00",
            "remote_url": "https://www.linkedin.com/feed/update/urn:li:share:10",
            "draft": {"post": "Variables are labelled boxes. @PyMasters https://pymasters.net", "hashtags": ["#Python", "#AI", "#PyMasters"], "code_snippet": ""},
            "media": {"gif": str(tmp_path / "post_dir/loop.gif"), "video": str(tmp_path / "post_dir/loop.mp4"), "lesson_url": "https://pymasters.net"},
        },
        {
            "id": 11, "kind": "short", "source_key": "lesson:ai_fundamentals/prompts",
            "topic": "How AI Prompts Work", "status": "scheduled", "score": 8.7,
            "created_at": "2026-11-13T10:00:00+00:00", "publish_at": "2026-11-14T13:00:00+00:00",
            "remote_url": "https://youtube.com/shorts/abc",
            "draft": {"title": "How AI Prompts Work", "hook": "Think of a prompt like a clear kitchen order.",
                      "scenes": [{"narration": "A clear order gets the right result.", "visual": {"type": "flow", "step_badge": "1", "heading": "Order", "note": "Clear input = clear output"}}],
                      "cta": "Try free lessons at pymasters.net", "description": "Learn simply at https://pymasters.net", "tags": ["Python", "AI"]},
            "media": {"video": str(tmp_path / "short_dir/video.mp4"), "thumbnail": str(tmp_path / "short_dir/thumb.jpg"), "srt": str(tmp_path / "short_dir/captions.srt"), "lesson_url": "https://pymasters.net"},
        },
        {
            "id": 12, "kind": "long", "source_key": "lesson:dsa/sorting",
            "topic": "Sorting Basics", "status": "rendered", "score": 8.8,
            "created_at": "2026-11-14T03:00:00+00:00", "publish_at": None, "remote_url": None,
            "draft": {"title": "Sorting Basics in Plain English", "hook": "Learn sorting step by step.",
                      "chapters": [{"title": "Intro", "scenes": [{"narration": "Compare two cards at a time.", "visual": {"type": "compare", "heading": "Swap", "note": "Put smaller card first"}}]}],
                      "cta": "Practice at pymasters.net", "description": "Full lesson at https://pymasters.net", "tags": ["Sorting"]},
            "media": {"video": str(tmp_path / "long_dir/video.mp4"), "thumbnail": str(tmp_path / "long_dir/thumb.jpg"), "srt": str(tmp_path / "long_dir/captions.srt"), "lesson_url": "https://pymasters.net"},
        },
    ]

    monkeypatch.setattr(config, "DRIVE_MANIFEST_PATH", tmp_path / "drive_sync.json")
    monkeypatch.setattr(config, "ensure_dirs", lambda: None)
    monkeypatch.setattr(drive.store, "items", lambda status=None, limit=500: [r for r in rows if r["status"] == status])

    fake_svc = _FakeDriveService("muthu.g.subramanian@gmail.com")
    monkeypatch.setattr(drive, "client", lambda: fake_svc)

    # First run uploads everything
    res1 = drive.sync_all()
    assert res1["account"] == "muthu.g.subramanian@gmail.com"
    assert res1["items"] == 3
    # 4 files for post + 5 for short + 5 for long = 14 files
    assert res1["uploaded"] == 14
    assert res1["updated"] == 0

    names = {f["name"]: f for f in fake_svc.files_db.values()}
    assert "PyMasters Social Content" in names
    assert {"Posts", "Shorts", "Videos"}.issubset(names.keys())
    assert "post.txt" in names and "script.txt" in names
    assert "loop.gif" in names and "video.mp4" in names

    # Second run is 100% idempotent
    res2 = drive.sync_all()
    assert res2["uploaded"] == 0 and res2["updated"] == 0 and res2["skipped"] == 14

    # Updating item #12 status updates only text/metadata, skipping unchanged video/thumb/srt
    rows[2]["status"] = "published"
    rows[2]["remote_url"] = "https://youtu.be/xyz"
    res3 = drive.sync_all()
    assert res3["uploaded"] == 0
    assert res3["updated"] == 2
    assert res3["skipped"] == 12


def test_verify_account_rejects_wrong_google_email(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DRIVE_MANIFEST_PATH", tmp_path / "drive_sync.json")
    monkeypatch.setattr(config, "GOOGLE_DRIVE_EMAIL", "muthu.g.subramanian@gmail.com")
    wrong_svc = _FakeDriveService("other@example.com")
    monkeypatch.setattr(drive, "client", lambda: wrong_svc)
    with pytest.raises(RuntimeError, match="muthu.g.subramanian@gmail.com"):
        drive.sync_all()


def test_future_generated_items_auto_sync_in_produce_and_tick(tmp_path, monkeypatch):
    from socialbot import pipeline, scheduler

    # 1) pipeline.produce() immediately syncs newly rendered item into Drive manifest
    monkeypatch.setattr(config, "DRIVE_MANIFEST_PATH", tmp_path / "drive_sync.json")
    monkeypatch.setattr(config, "RENDERS_DIR", tmp_path / "renders")
    monkeypatch.setattr(config, "STATE_DIR", tmp_path)
    monkeypatch.setattr(config, "ensure_dirs", lambda: None)

    video_path = tmp_path / "renders" / "video.mp4"
    video_path.parent.mkdir(parents=True)
    video_path.write_bytes(b"future_short_mp4")

    les = {
        "key": "lesson:python_fundamentals/variables_intro",
        "title": "Variables Simply Explained",
        "url": "https://pymasters.net/dashboard/classroom/variables_intro",
    }
    monkeypatch.setattr(pipeline.sources, "candidates", lambda: [les])
    monkeypatch.setattr(
        pipeline,
        "write_until_good",
        lambda kind, l: (
            True,
            {"title": "Variables", "hook": "Think of a box.", "scenes": [], "cta": "pymasters.net", "description": "pymasters.net", "tags": ["Python"]},
            9.0,
            {},
            [],
            0.0,
        ),
    )
    monkeypatch.setattr(pipeline, "render", lambda kind, d, l, out_dir: {"video": str(video_path)})

    stored = {}
    monkeypatch.setattr(pipeline.store, "add_item", lambda kind, key, title, status, **kw: stored.update({
        "id": 999, "kind": kind, "source_key": key, "topic": title, "status": status,
        "created_at": "2026-11-15T10:00:00+00:00", **kw
    }) or 999)
    monkeypatch.setattr(pipeline.store, "update_item", lambda item_id, **kw: stored.update(kw))
    monkeypatch.setattr(pipeline.store, "get_item", lambda item_id: dict(stored))

    fake_svc = _FakeDriveService("muthu.g.subramanian@gmail.com")
    monkeypatch.setattr(drive, "is_authorised", lambda: True)
    monkeypatch.setattr(drive, "client", lambda: fake_svc)

    item_id = pipeline.produce("short", lesson_key=les["key"])
    assert item_id == 999
    synced_names = {f["name"] for f in fake_svc.files_db.values()}
    assert {"PyMasters Social Content", "Shorts", "script.txt", "metadata.json", "video.mp4"}.issubset(synced_names)

    # 2) scheduler.tick() calls sync_drive() to keep future generated/published items synced
    tick_calls = []
    for name in ("refresh_daily_trends", "resume_interrupted", "publish_due", "refresh_metrics"):
        monkeypatch.setattr(scheduler, name, lambda: None)
    monkeypatch.setattr(scheduler, "produce_ahead", lambda ahead=2, kinds=(): None)
    monkeypatch.setattr(scheduler, "sync_drive", lambda: tick_calls.append("sync_drive"))
    scheduler.tick()
    assert tick_calls == ["sync_drive"]

