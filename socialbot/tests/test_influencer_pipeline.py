"""Phase 3 tests: Human-influencer pipeline (script synthesis, pluggable avatar adapters,
headless Playwright B-roll HTML & 60fps capture, ASS captions, and FFmpeg PiP compositing).
"""

import json
import subprocess
from pathlib import Path

import pytest

from socialbot import avatar, broll_capture
from socialbot.render import influencer


def _make_synthetic_mp4(path: Path, color: str = "navy", duration_s: float = 3.0, with_audio: bool = True) -> Path:
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        f"color=c={color}:s=640x360:r=30:d={duration_s}",
    ]
    if with_audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duration_s}"]
    cmd += [
        "-threads",
        "2",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
    ]
    if with_audio:
        cmd += ["-c:a", "aac", "-shortest"]
    cmd.append(str(path))
    subprocess.run(cmd, check=True, timeout=60)
    return path


def test_synthesize_influencer_script_and_ass_captions(tmp_path):
    lesson = {
        "topic": "python_dicts",
        "title": {"en": "Python Dictionaries"},
        "description": {"en": "Store fast key-value pairs cleanly."},
        "story_variants": {"en": "Imagine an instant lookup directory linking each name to an ID."},
        "practice_challenges": [
            {
                "solution": "scores = {'alice': 95, 'bob': 88}\nprint(scores['alice'])",
                "expected_output": "95",
            }
        ],
    }
    plan = influencer.synthesize_influencer_script(lesson, bilingual_hook=True)
    assert "Vanakkam nanba and nanbis!" in plan["script_text"]
    assert len(plan["segments"]) == 5
    assert plan["segments"][0]["layout"] == "full_presenter"
    assert plan["segments"][2]["layout"] == "pip_code"
    assert plan["code_lines"][0].startswith("scores =")

    ass_file = influencer.generate_ass_subtitles(plan["segments"], tmp_path / "subs.ass")
    assert ass_file.exists()
    content = ass_file.read_text(encoding="utf-8")
    assert "Dialogue: 0," in content
    assert "[V4+ Styles]" in content


def test_pluggable_avatar_adapters_and_mocked_render(tmp_path, monkeypatch):
    # Provider factory coverage
    assert isinstance(avatar.get_avatar_adapter("heygen"), avatar.HeyGenAdapter)
    assert isinstance(avatar.get_avatar_adapter("tavus"), avatar.TavusAdapter)
    assert isinstance(avatar.get_avatar_adapter("synthesia"), avatar.SynthesiaAdapter)
    with pytest.raises(ValueError):
        avatar.get_avatar_adapter("unknown_vendor")

    fake_src = _make_synthetic_mp4(tmp_path / "avatar_src.mp4", color="teal", duration_s=1.5)
    raw_bytes = fake_src.read_bytes()

    class DummyResp:
        def __init__(self, json_data=None, content=b""):
            self._json = json_data or {}
            self._content = content

        def raise_for_status(self):
            return None

        def json(self):
            return self._json

        def iter_content(self, chunk_size=131072):  # noqa: ARG002
            yield self._content

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_post(url, headers=None, json=None, timeout=30):  # noqa: ARG002
        assert "X-Api-Key" in headers
        return DummyResp({"data": {"video_id": "hg_job_42"}})

    def fake_get(url, headers=None, params=None, stream=False, timeout=20):  # noqa: ARG002
        if stream:
            return DummyResp(content=raw_bytes)
        return DummyResp({"data": {"status": "completed", "video_url": "https://cdn.example/v.mp4", "duration": 4.2}})

    monkeypatch.setenv("HEYGEN_API_KEY", "test-heygen-key")
    monkeypatch.setattr(avatar.config, "HEYGEN_API_KEY", "test-heygen-key")
    monkeypatch.setattr(avatar.requests, "post", fake_post)
    monkeypatch.setattr(avatar.requests, "get", fake_get)

    out_mp4 = tmp_path / "downloaded_presenter.mp4"
    res = avatar.render_talking_head("Hello learners!", out_mp4, title="Dicts", provider="heygen", poll_s=0)
    assert res.provider == "heygen"
    assert res.job_id == "hg_job_42"
    assert out_mp4.exists() and out_mp4.stat().st_size > 1000


def test_broll_html_playwright_and_ffmpeg_compositor(tmp_path):
    # Verify Watch-It-Run B-roll HTML builder + Playwright 60fps capture when e2e-venv is present
    code_lines = ["items = [10, 20]", "total = sum(items)", "print(total)"]
    steps = [
        {"line": 1, "vars": {"items": "[10, 20]"}, "explain": "Create list of two integers"},
        {"line": 3, "vars": {"total": "30"}, "explain": "Print computed total"},
    ]
    html_text = broll_capture.build_trace_html("List Sum", code_lines, steps, stdout_text="30")
    assert "PyMasters" in html_text and "window.renderTraceStep" in html_text

    broll_mp4 = tmp_path / "broll.mp4"
    if Path(broll_capture.config.PLAYWRIGHT_PYTHON).exists():
        broll_capture.capture_watch_it_run_broll(
            "List Sum",
            code_lines,
            steps,
            broll_mp4,
            duration_s=2.0,
            stdout_text="30",
            fps=60,
            width=1280,
            height=720,
        )
    else:
        _make_synthetic_mp4(broll_mp4, color="black", duration_s=2.0, with_audio=False)

    presenter_mp4 = _make_synthetic_mp4(tmp_path / "presenter.mp4", color="darkblue", duration_s=3.0, with_audio=True)
    segments = [
        {"id": "intro", "layout": "full_presenter", "start_s": 0.0, "end_s": 1.0, "narration": "Welcome to PyMasters simple Python guide"},
        {"id": "walk", "layout": "pip_code", "start_s": 1.0, "end_s": 2.2, "narration": "Watch each line update variables clearly"},
        {"id": "outro", "layout": "full_presenter", "start_s": 2.2, "end_s": 3.0, "narration": "Practice free at pymasters dot net"},
    ]
    ass_path = influencer.generate_ass_subtitles(segments, tmp_path / "captions.ass", width=1280, height=720)
    final_mp4 = influencer.composite_influencer_video(
        presenter_mp4=presenter_mp4,
        broll_mp4=broll_mp4,
        segments=segments,
        out_mp4=tmp_path / "final_influencer.mp4",
        subtitle_ass=ass_path,
        width=1280,
        height=720,
    )
    assert final_mp4.exists() and final_mp4.stat().st_size > 5000

    # Verify video stream dimensions via ffprobe
    probe = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", str(final_mp4)],
        text=True,
    )
    info = json.loads(probe)
    assert info["streams"][0]["width"] == 1280
    assert info["streams"][0]["height"] == 720


def test_zero_cost_hybrid_short_influencer_and_long_conversational_no_presenter(tmp_path, monkeypatch):
    import numpy as np
    from socialbot import briefs, config, quality, tts
    from socialbot.render import presenter_overlay as PO
    from socialbot.render import scenes as S
    from socialbot.render import video as V

    # 1) Verify configuration matches owner's hybrid rules ($0, Short influencer ON, Long presenter OFF)
    assert config.SHORT_LIVE_INFLUENCER is True
    assert config.LONG_LIVE_PRESENTER is False
    assert config.LONG_CONVERSATIONAL_AUDIO is True
    assert isinstance(avatar.get_avatar_adapter("google_zero_cost"), avatar.GoogleZeroCostAvatarAdapter)

    # 2) Verify prompts & hard_checks embrace "Vanakkam nanba and nanbis!" while keeping Hindi banned
    les = {
        "key": "lesson:python_intermediate/generators",
        "title": "Generators: One Item at a Time",
        "track": "python_intermediate",
        "difficulty": "intermediate",
        "description": "Stream data lazily without filling RAM.",
        "concepts": ["generators", "yield"],
        "story": "Generators produce one value on demand." * 25,
        "challenges": [],
        "url": "https://pymasters.net/dashboard/classroom/generators",
    }
    sp = briefs.short_prompt(les)
    lp = briefs.long_prompt(les)
    assert "Vanakkam nanba and nanbis!" in sp
    assert "Vanakkam nanba and nanbis!" in lp
    assert "Ananya:" in lp and "Vaathiyaar:" in lp

    # Verify uneven indentation in LinkedIn code_snippet compiles cleanly via _normalize_code
    uneven_code = "items = [1, 2, 3]\n    total = sum(items)\n    print(total)"
    assert quality._compile_errors(uneven_code, "code_snippet") == []

    # 3) Verify 2-speaker turn parsing & speaker-prefix stripping for burned-in captions
    sample_turn = "Vaathiyaar: Vanakkam nanba and nanbis! Let us simplify memory streams. Ananya: Why not load everything at once?"
    turns = tts.parse_dialogue_turns(sample_turn)
    assert [who for who, _ in turns] == ["Vaathiyaar", "Ananya"]
    stripped = tts.strip_speaker_labels(sample_turn)
    assert "Vaathiyaar:" not in stripped and "Ananya:" not in stripped
    assert "Vanakkam nanba and nanbis!" in stripped

    # 4) Verify Short Hero + PiP presenter rendering (`1080x1920`) and Long 2-host no-presenter rendering (`1920x1080`)
    def fake_gemini_tts(prompt_text, multi_speaker=False, timeout=75):  # noqa: ARG001
        # Deterministic 1.8s synthetic speech envelope @ 24kHz so test runs fast & offline
        t = np.linspace(0, 1.8, int(1.8 * tts.SR), endpoint=False, dtype=np.float32)
        mod = (0.5 + 0.5 * np.sin(2 * np.pi * 4.5 * t)).astype(np.float32)
        return (0.25 * np.sin(2 * np.pi * 220.0 * t) * mod).astype(np.float32)

    monkeypatch.setattr(tts, "_call_gemini_tts", fake_gemini_tts)

    # Confirm widescreen Cinema Veo Hero & PiP overlays render cleanly
    from PIL import Image
    f_short = S.Frame(1080, 1920)
    sample_veo = Image.new("RGB", (1280, 720), (28, 42, 72))
    hero_img = PO.draw_short_hero_presenter(
        f_short.bg.copy(), f_short, {"heading": "KV-Cache Under the Hood"}, 0.5, 0.2, 0.7, 0.4, veo_frame=sample_veo
    )
    assert hero_img.size == (1080, 1920)
    PO.draw_short_pip_presenter(hero_img, f_short, 0.65, 0.8, veo_frame=sample_veo)

    short_segs = [
        {"narration": "Vanakkam nanba and nanbis! Why do giant files freeze laptops?", "visual": {"type": "title", "heading": "Smart Streams"}},
        {"narration": "Think of handing out one ticket at a time.", "visual": {"type": "flow", "heading": "One By One", "nodes": ["Ask", "Next"], "edges": [[0, 1]]}},
        {"narration": "Practice interactively for free at pymasters.net.", "visual": {"type": "reveal", "heading": "Try It Free", "big": "pymasters.net"}},
    ]
    short_media = V.render_narrated(short_segs, tmp_path / "short_out", 1080, 1920, captions=True)
    assert Path(short_media["video"]).exists()
    short_srt = Path(short_media["srt"]).read_text(encoding="utf-8")
    assert "nanbis!" in short_srt

    long_segs = [
        {"narration": "Vaathiyaar: Vanakkam nanba and nanbis! Welcome back. Ananya: Why do streams save RAM?",
         "visual": {"type": "title", "heading": "Streams Deep Dive"}, "chapter": "Intro"},
        {"narration": "Vaathiyaar: Because Python keeps only one item in memory at a time.",
         "visual": {"type": "reveal", "heading": "Key Rule", "big": "One Item In RAM"}, "chapter": "Takeaway"},
    ]
    long_media = V.render_narrated(long_segs, tmp_path / "long_out", 1920, 1080, captions=True)
    assert Path(long_media["video"]).exists()
    long_srt = Path(long_media["srt"]).read_text(encoding="utf-8")
    assert "Vaathiyaar:" not in long_srt and "Ananya:" not in long_srt
    assert "nanbis!" in long_srt


def test_resume_interrupted_skips_actively_locked_render(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import subprocess
    import sys

    from socialbot import config, pipeline, scheduler, sources, store

    monkeypatch.setattr(config, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "state" / "socialbot.sqlite3")
    monkeypatch.setattr(config, "RENDERS_DIR", tmp_path / "renders")
    config.ensure_dirs()

    fake_lesson = {
        "key": "lesson:test/locks",
        "title": "Render Lock Safety",
        "url": "https://pymasters.net/dashboard/classroom/locks",
    }
    monkeypatch.setattr(sources, "candidates", lambda: [fake_lesson])
    render_calls = []

    def fake_render(kind, draft, les, out_dir):
        render_calls.append((kind, out_dir))
        return {"video": str(out_dir / "video.mp4")}

    monkeypatch.setattr(pipeline, "render", fake_render)
    item_id = store.add_item("short", fake_lesson["key"], fake_lesson["title"], "drafted", draft={"title": "T"})

    # Hold `render-{item_id}.lock` in a child process to simulate an active `produce("short")` run
    holder = subprocess.Popen(
        [
            sys.executable,
            "-c",
            (
                "import fcntl, sys, time; "
                f"f = open({str(config.STATE_DIR / f'render-{item_id}.lock')!r}, 'a+'); "
                "fcntl.flock(f, fcntl.LOCK_EX); "
                "sys.stdout.write('LOCKED\\n'); sys.stdout.flush(); "
                "time.sleep(10)"
            ),
        ],
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert holder.stdout.readline().strip() == "LOCKED"
        scheduler.resume_interrupted()
        assert render_calls == []
        assert store.get_item(item_id)["status"] == "drafted"
    finally:
        holder.terminate()
        holder.wait(timeout=5)

    # Once the active render process exits (or crashes), resume_interrupted picks it up cleanly
    scheduler.resume_interrupted()
    assert len(render_calls) == 1
    assert store.get_item(item_id)["status"] == "rendered"


def test_broadcast_presenter_quality_gate_and_complex_topic_filter(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import numpy as np
    import soundfile as sf
    from PIL import Image

    from socialbot import config, quality, sources, store, tts, vids_avatar
    from socialbot.render import video as V

    monkeypatch.setattr(config, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "state" / "socialbot.sqlite3")
    config.ensure_dirs()

    # 1) Static/frozen video MUST be rejected by verify_broadcast_presenter_mp4
    frozen_wav = tmp_path / "frozen.wav"
    t = np.linspace(0, 2.2, int(2.2 * tts.SR), endpoint=False, dtype=np.float32)
    sf.write(frozen_wav, (0.2 * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32), tts.SR)
    frozen_mp4 = tmp_path / "frozen.mp4"
    wr = V.FFmpegWriter(frozen_mp4, 1280, 720, fps=24, audio=frozen_wav)
    static_img = Image.new("RGB", (1280, 720), (40, 50, 70))
    for _ in range(52):
        wr.write(static_img)
    wr.close()
    with pytest.raises(vids_avatar.PresenterQualityError):
        vids_avatar.verify_broadcast_presenter_mp4(frozen_mp4, expected_min_s=1.5)

    # 2) Basic intro lessons MUST be filtered out in favor of advanced complex engineering tracks
    monkeypatch.setattr(config, "TREND_SHARE", 0.0)
    monkeypatch.setattr(config, "HF_SPACE_SHARE", 0.0)
    fake_lessons = [
        {"key": "lesson:python_fundamentals/add_list", "id": "add_list", "track": "python_fundamentals", "difficulty": "beginner",
         "title": "Adding List Numbers", "topic": "sum", "story": "x" * 900, "code_blocks": ["print(1)"], "challenges": [], "concepts": [], "url": "https://pymasters.net"},
        {"key": "lesson:transformers_scratch/kv_cache", "id": "kv_cache", "track": "transformers_scratch", "difficulty": "advanced",
         "title": "KV-Cache & Grouped-Query Attention", "topic": "kv cache", "story": "x" * 2400, "code_blocks": ["print(1)"], "challenges": [], "concepts": [], "url": "https://pymasters.net"},
    ]
    monkeypatch.setattr(sources, "candidates", lambda **kw: fake_lessons)
    picked = sources.pick("short", n=1, seed=42)
    assert picked[0]["key"] == "lesson:transformers_scratch/kv_cache"

    # 3) Critic topic_depth < 7.5 MUST fail quality.verdict even when simplicity is high
    monkeypatch.setattr(quality, "hard_checks", lambda k, d: [])
    monkeypatch.setattr(quality, "attach_real_outputs", lambda k, d: {})
    monkeypatch.setattr(
        quality,
        "critique",
        lambda k, d, l: {
            "overall": 8.2,
            "scores": {"hook": 8, "accuracy": 9, "specificity": 8, "clarity": 9, "originality": 8, "brand_rules": 9, "simplicity": 8.5, "topic_depth": 5.0},
            "factual_errors": [],
            "blocking_issues": [],
            "polish": [],
        },
    )
    ok, _sc, _crit, probs = quality.verdict("short", {"title": "Toy Math"}, fake_lessons[1])
    assert not ok
    assert any("topic_depth" in p for p in probs)


def test_twice_daily_shorts_randomized_avatars_8_domains_and_linkedin_themes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import random
    from PIL import Image

    from socialbot import config, scheduler, sources, store, vids_avatar
    from socialbot.render import linkedin_themes as LT
    from socialbot.render import video as V

    monkeypatch.setattr(config, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "state" / "socialbot.sqlite3")
    config.ensure_dirs()

    # 1) Twice-daily YouTube Shorts cadence (12:30 IST & 18:30 IST -> >= 14/week, >= 2 slots/day)
    assert config.CADENCE["short"]["per_week"] >= 14
    assert len(config.CADENCE["short"]["publish_hhmms"]) >= 2
    slots = scheduler.upcoming_slots("short", days=4)
    assert len(slots) >= 6

    # 2) Randomized Veo 3 Realistic AI Presenter avoids repeating the last 4 presenters
    monkeypatch.setattr(config, "GOOGLE_VIDS_AVATAR_NAME", "random")
    used_avatars = ["William", "Mia", "Levi", "Sofia"]
    for av in reversed(used_avatars):
        store.add_item("short", f"lesson:ai/{av}", av, "published", media={"presenter_avatar": av})
    for seed in range(10):
        picked_av = vids_avatar.pick_random_avatar(rng=random.Random(seed))
        assert picked_av in config.GOOGLE_VIDS_AVATAR_POOL
        assert picked_av not in used_avatars

    # 3) Non-repeating 8-domain topic rotation across Python, AI, Data Science, ML, DL, Algorithms, Data Structures, FinTech
    eight_cands = [
        {"key": f"lesson:{dom}/t1", "id": f"{dom}_1", "track": "ai_engineering", "difficulty": "advanced",
         "domain": dom, "domain_label": sources.DOMAIN_LABELS[dom],
         "title": f"Enterprise {dom} Architecture", "topic": dom, "description": dom,
         "story": "x" * 2200, "code_blocks": ["print(1)"], "challenges": [], "concepts": [dom], "url": "https://pymasters.net"}
        for dom in config.CONTENT_DOMAINS
    ]
    monkeypatch.setattr(sources, "candidates", lambda **kw: eight_cands)
    picks = sources.pick("short", n=6, seed=7)
    picked_domains = [p["domain"] for p in picks]
    assert len(set(picked_domains)) == 6

    # 4) Enterprise LinkedIn Theme & Layout randomizer avoids monotony across Light & Dark palettes and aspect ratios
    store.add_item("linkedin", "lesson:ai/1", "T1", "published", media={"design_theme": "executive_ivory", "design_layout": "portrait_brief"})
    next_design = LT.pick_linkedin_design(rng=random.Random(3))
    assert next_design["theme_id"] != "executive_ivory"
    assert next_design["layout_id"] != "portrait_brief"
    # Previous was Light (executive_ivory), so next alternates to an institutional Dark palette
    assert next_design["theme"]["palette"]["IS_LIGHT"] is False

    # Render one Light 4:5 Portrait Brief loop and one Dark 5:4 Boardroom Slide loop to verify GIF & MP4 output
    anim = {
        "title": "Idempotency Keys in Payment APIs",
        "beats": [
            {"kind": "metric", "step_badge": "1 · RISK", "caption": "Duplicate retries without keys double-charge.",
             "metrics": [{"label": "RETRY RATE", "value": "3.2%", "sub": "Mobile timeout retries"},
                         {"label": "DOUBLE CHARGE", "value": "0.0%", "sub": "With idempotency ledger"}]},
            {"kind": "code", "step_badge": "2 · LEDGER", "caption": "Atomic key lookup returns cached receipt.",
             "code": "seen = {'tx_9': 'OK'}\nprint(seen.get('tx_9'))", "output": "OK"},
        ],
    }
    light_design = {
        "theme_id": "executive_ivory",
        "layout_id": "portrait_brief",
        "theme": LT.ENTERPRISE_THEMES["executive_ivory"],
        "layout": LT.ENTERPRISE_LAYOUTS["portrait_brief"],
    }
    m_light = V.render_loop(anim, tmp_path / "li_light", domain_label="FinTech & Payment Systems", design=light_design)
    assert Path(m_light["gif"]).is_file()
    with Image.open(m_light["gif"]) as g_img:
        assert g_img.size == (720, 900)

    dark_design = {
        "theme_id": "emerald_terminal",
        "layout_id": "boardroom_slide",
        "theme": LT.ENTERPRISE_THEMES["emerald_terminal"],
        "layout": LT.ENTERPRISE_LAYOUTS["boardroom_slide"],
    }
    m_dark = V.render_loop(anim, tmp_path / "li_dark", domain_label="Algorithms & Optimization", design=dark_design)
    assert Path(m_dark["gif"]).is_file()
    with Image.open(m_dark["gif"]) as g_img2:
        assert g_img2.size == (800, 640)
