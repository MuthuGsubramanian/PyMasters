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

    # Confirm Studio Vaathiyaar assets load cleanly and render both Hero & PiP frames
    f_short = S.Frame(1080, 1920)
    hero_img = PO.draw_short_hero_presenter(
        f_short.bg.copy(), f_short, {"heading": "Generators Made Simple"}, 0.5, 0.2, 0.7, 0.4
    )
    assert hero_img.size == (1080, 1920)
    PO.draw_short_pip_presenter(hero_img, f_short, 0.65, 0.8)

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
