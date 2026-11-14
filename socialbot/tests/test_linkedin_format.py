"""LinkedIn gets animated GIFs (visualised concepts) only — videos and Shorts are for YouTube — and the post format
mixes "jargon, made simple" with random "Fun with Python" real-world posts (owner, 2026-11-04)."""
import random

import pytest

from socialbot import briefs, pipeline
from socialbot.publish import linkedin

LES = {"key": "itertools", "title": "itertools: Lazy, Composable Iteration", "track": "python_intermediate",
       "difficulty": "intermediate", "description": "Chain, slice and group iterators lazily.",
       "concepts": ["iterators", "itertools"], "story": "itertools builds lazy pipelines.", "challenges": [],
       "url": "https://pymasters.net/dashboard/classroom/itertools"}
ITEM = {"topic": "itertools", "draft": {"post": "Hook line\n\nBody https://pymasters.net", "hashtags": ["#a", "#b", "#c"],
                                        "animation": {"title": "Lazy pipelines"}},
        "media": {"video": "/renders/x/loop.mp4", "gif": "/renders/x/loop.gif"}}


@pytest.fixture
def fake_api(monkeypatch):
    calls = []
    monkeypatch.setattr(linkedin, "_upload_video", lambda path: calls.append(("video", path)) or "urn:li:video:1")
    monkeypatch.setattr(linkedin, "_upload_image", lambda path: calls.append(("image", path)) or "urn:li:image:1")
    monkeypatch.setattr(linkedin, "_post", lambda text, urn, title: calls.append(("post", urn)) or "urn:li:share:1")
    monkeypatch.setattr(linkedin, "active_profile", lambda: "member")
    return calls


def test_linkedin_posts_the_animated_gif_never_the_video(fake_api):
    res = linkedin.publish(ITEM)
    assert ("image", "/renders/x/loop.gif") in fake_api
    assert not [c for c in fake_api if c[0] == "video"], "a video was uploaded to LinkedIn"
    assert ("post", "urn:li:image:1") in fake_api
    assert res["media"] == "gif"


def test_linkedin_refuses_to_post_without_a_gif(fake_api):
    item = {**ITEM, "media": {"video": "/renders/x/loop.mp4"}}
    with pytest.raises(linkedin.LinkedInError):
        linkedin.publish(item)
    assert not fake_api, "nothing may be uploaded or posted when the GIF is missing"


def test_strictly_professional_variety_formats_include_pymasters_link_and_page_tag():
    for style_name in config.LINKEDIN_STYLES:
        p = briefs.linkedin_prompt(LES, style=style_name)
        assert "strictly professional" in p
        assert "@PyMasters" in p
        assert LES["url"] in p
        assert "https://pymasters.net" in p


def test_default_prompt_keeps_the_jargon_made_simple_format():
    assert "jargon, made simple" in briefs.linkedin_prompt(LES, style="jargon")


def test_linkedin_style_alternates_between_business_and_tech_tracks_without_repeats(monkeypatch):
    fake = _FakeStore()
    monkeypatch.setattr(pipeline, "store", fake)
    rng = random.Random(7)
    picked = []
    for i in range(1, 60):
        st = pipeline.linkedin_style(rng)
        if picked:
            assert st != picked[-1], "consecutive LinkedIn posts must not repeat the same format"
            prev_is_biz = picked[-1] in config.LINKEDIN_BUSINESS_STYLES
            curr_is_biz = st in config.LINKEDIN_BUSINESS_STYLES
            assert prev_is_biz != curr_is_biz, "LinkedIn must alternate between Business-Simple and Technical-Detail tracks"
        picked.append(st)
        fake.rows[i] = {"id": i, "kind": "linkedin", "status": "rendered", "draft": {"format_variety": st}}
    assert set(picked) == set(config.LINKEDIN_STYLES)


def test_every_linkedin_post_tags_pymasters_page_and_links_to_pymasters_net():
    out1 = linkedin.little_text("Latency audit with @PyMasters on https://pymasters.net", ["#Python", "#AI", "#Risk"])
    assert "@[PyMasters](urn:li:organization:113061910)" in out1
    assert "https://pymasters.net" in out1

    # Even if a draft omitted the URL or @ prefix, little_text guarantees both the page tag and https://pymasters.net
    out2 = linkedin.little_text("Deterministic verification with PyMasters", ["#Python", "#AI", "#Engineering"])
    assert "@[PyMasters](urn:li:organization:113061910)" in out2
    assert "https://pymasters.net" in out2


def test_the_editor_enforces_strictly_professional_rules_and_rejects_casual_filler():
    crit = briefs.critic_prompt("linkedin", {"style": "tech_deep_dive", "post": "x"}, LES)
    assert "strictly professional" in crit and "@PyMasters" in crit
    casual_draft = {
        "style": "tech_deep_dive",
        "post": "A" * 850 + " splitting a restaurant bill with @PyMasters https://pymasters.net",
        "code_snippet": "print(1)",
        "hashtags": ["#Python", "#AI", "#Engineering"],
        "animation": {"title": "Check", "beats": [{"kind": "reveal", "caption": "ok", "big": "OK", "sub": "ok"}]},
    }
    errs = quality.hard_checks("linkedin", casual_draft)
    assert any("banned phrase: restaurant bill" in e for e in errs)


def test_business_track_posts_allow_no_code_wall_while_tech_track_requires_runnable_code():
    biz_draft = {
        "style": "business_story",
        "post": "A" * 850 + " @PyMasters https://pymasters.net",
        "code_snippet": "",
        "hashtags": ["#AI", "#Leadership", "#PyMasters"],
        "animation": {
            "title": "Cost per 1M Decisions",
            "beats": [
                {
                    "kind": "metric",
                    "step_badge": "1 · THE COST GAP",
                    "caption": "Guarded routing cuts monthly inference spend by 68%.",
                    "metrics": [
                        {"label": "UNROUTED", "value": "$42,000/mo", "sub": "Every ticket hits 70B LLM"},
                        {"label": "GUARDED", "value": "$13,400/mo", "sub": "82% resolved by deterministic rules"},
                    ],
                }
            ],
        },
    }
    assert not quality.hard_checks("linkedin", biz_draft)

    tech_missing_code = {**biz_draft, "style": "tech_deep_dive", "code_snippet": ""}
    errs = quality.hard_checks("linkedin", tech_missing_code)
    assert any("technical LinkedIn format requires a non-empty runnable code_snippet" in e for e in errs)


# ---------- Weekly LinkedIn cadence & YouTube focus (owner, 2026-11-14) ----------
from datetime import datetime, timedelta, timezone

from socialbot import config, quality, scheduler


class _FakeStore:
    def __init__(self, items=()):
        self.rows = {it["id"]: dict(it) for it in items}

    def items(self, status=None, kind=None, limit=50):
        rows = [r for r in self.rows.values() if (status is None or r["status"] == status) and (kind is None or r["kind"] == kind)]
        return sorted(rows, key=lambda r: -r["id"])[:limit]

    def update_item(self, item_id, **kw):
        self.rows[item_id].update(kw)


def _freeze(monkeypatch, now):
    class _DT(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)
    monkeypatch.setattr(scheduler, "datetime", _DT)


def _secs(slots):
    ts = [datetime.fromisoformat(s) for s in slots]
    return {int((b - a).total_seconds()) for a, b in zip(ts, ts[1:])}


def test_linkedin_cadence_is_minimized_to_once_per_week():
    li = config.CADENCE["linkedin"]
    th = config.CADENCE["thematic"]
    assert li["per_week"] == 1
    assert len(li["weekdays"]) == 1
    assert "interval_hours" not in li
    assert th["per_week"] == 0 and th["weekdays"] == []
    assert li["per_week"] + th["per_week"] == 1


def test_linkedin_slots_are_strictly_weekly_while_youtube_stays_active(monkeypatch):
    monkeypatch.setattr(scheduler, "store", _FakeStore())
    _freeze(monkeypatch, datetime(2026, 11, 14, 10, 30, tzinfo=scheduler.TZ))
    li_slots = scheduler.upcoming_slots("linkedin", days=14)
    assert len(li_slots) == 2
    assert _secs(li_slots) == {7 * 86400}
    assert scheduler.upcoming_slots("thematic", days=14) == []
    assert len(scheduler.upcoming_slots("short", days=7)) == 7
    assert len(scheduler.upcoming_slots("long", days=14)) == 2


def test_open_weekly_linkedin_window_is_kept_until_taken(monkeypatch):
    # Wednesday 10:10 IST: same-day 10:00 IST window stays open until taken by a post
    now = datetime(2026, 11, 18, 10, 10, tzinfo=scheduler.TZ)
    _freeze(monkeypatch, now)
    monkeypatch.setattr(scheduler, "store", _FakeStore())
    first = scheduler.upcoming_slots("linkedin", days=14)[0]
    assert datetime.fromisoformat(first).astimezone(scheduler.TZ).date() == now.date()
    taken = _FakeStore([{"id": 1, "kind": "linkedin", "status": "published", "publish_at": first}])
    monkeypatch.setattr(scheduler, "store", taken)
    next_slot = scheduler.upcoming_slots("linkedin", days=14)[0]
    assert datetime.fromisoformat(next_slot) - datetime.fromisoformat(first) == timedelta(days=7)


def test_publish_due_blocks_second_linkedin_post_in_same_iso_week(monkeypatch):
    from socialbot.publish import linkedin as li_pub

    published_calls = []
    monkeypatch.setattr(li_pub, "publish", lambda it: published_calls.append(it["id"]) or {"id": f"urn:{it['id']}", "url": "https://lnkd.in/test"})
    # Already published earlier in the same ISO week (2026-W46: Fri Nov 13)
    now = datetime(2026, 11, 15, 12, 0, tzinfo=scheduler.TZ)
    _freeze(monkeypatch, now)
    fake = _FakeStore([
        {"id": 1, "kind": "linkedin", "status": "published", "topic": "prev", "publish_at": "2026-11-13T05:15:00+00:00"},
        {"id": 2, "kind": "linkedin", "status": "rendered", "topic": "extra-li", "publish_at": "2026-11-14T04:30:00+00:00"},
        {"id": 3, "kind": "thematic", "status": "rendered", "topic": "retired-th", "publish_at": "2026-11-15T05:30:00+00:00"},
    ])
    monkeypatch.setattr(scheduler, "store", fake)
    scheduler.publish_due()
    assert published_calls == []
    assert fake.rows[2]["status"] == "rendered"
    assert fake.rows[3]["status"] == "rendered"

    # Next ISO week (2026-W47: Wed Nov 18): eligible weekly LinkedIn post publishes once, disabled thematic stays skipped
    _freeze(monkeypatch, datetime(2026, 11, 18, 10, 5, tzinfo=scheduler.TZ))
    scheduler.publish_due()
    assert published_calls == [2]
    assert fake.rows[2]["status"] == "published"
    assert fake.rows[3]["status"] == "rendered"


def test_tick_keeps_linkedin_to_single_slot_and_youtube_ahead(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(config, "STATE_DIR", tmp_path)
    monkeypatch.setattr(config, "ensure_dirs", lambda: None)
    for name in ("refresh_daily_trends", "resume_interrupted", "publish_due", "refresh_metrics"):
        monkeypatch.setattr(scheduler, name, lambda: None)
    monkeypatch.setattr(scheduler, "produce_ahead", lambda ahead=2, kinds=(): calls.append((tuple(kinds), ahead)))
    _freeze(monkeypatch, datetime(2026, 11, 10, 14, 0, tzinfo=scheduler.TZ))
    scheduler.tick()
    assert calls == [(("linkedin",), 1), (("short", "long"), 1)]
    calls.clear()
    _freeze(monkeypatch, datetime(2026, 11, 10, 3, 0, tzinfo=scheduler.TZ))
    scheduler.tick()
    assert calls == [(("linkedin",), 1), (("short", "long"), 2)]


def test_snippets_run_in_the_social_venv_so_taught_packages_import():
    if quality.SOCIAL_VENV_PY.exists():
        assert quality.snippet_python() == str(quality.SOCIAL_VENV_PY)
    ok, out, _ = quality.run_snippet("print(sum(range(10)))")
    assert ok and out.strip() == "45"


# ---------- Hugging Face Spaces random one-by-one rotation (owner, 2026-11-10) ----------
from socialbot import sources


def test_all_five_hf_spaces_have_runnable_code_blocks():
    spaces = sources.hf_space_candidates()
    assert len(spaces) == 5
    for sp in spaces:
        assert sp["is_hf_space"] is True
        assert sp["space_url"].startswith("https://huggingface.co/spaces/Muthu88/pymasters-")
        assert len(sp["code_blocks"]) >= 2
        for code in sp["code_blocks"]:
            ok, out, err = quality.run_snippet(code)
            assert ok, f"{sp['key']} snippet failed: {err}"
            assert out.strip(), f"{sp['key']} snippet printed nothing"


def test_hf_spaces_are_picked_one_by_one_randomly_without_repeats_across_linkedin_and_shorts(monkeypatch):
    fake_store = _FakeStore()
    monkeypatch.setattr(sources, "store", fake_store)
    rng = random.Random(42)

    # First cycle of 5 on LinkedIn covers all 5 unique Spaces one-by-one in random order
    linkedin_first_cycle = []
    for i in range(1, 6):
        chosen = sources.pick_hf_space("linkedin", rng=rng)
        assert chosen["key"] not in linkedin_first_cycle, "repeated an HF Space before all 5 were covered"
        linkedin_first_cycle.append(chosen["key"])
        fake_store.rows[i] = {"id": i, "kind": "linkedin", "status": "rendered", "source_key": chosen["key"]}
    assert len(set(linkedin_first_cycle)) == 5

    # Shorts track its own independent 5-Space cycle
    short_first_cycle = []
    for i in range(10, 15):
        chosen = sources.pick_hf_space("short", rng=rng)
        assert chosen["key"] not in short_first_cycle
        short_first_cycle.append(chosen["key"])
        fake_store.rows[i] = {"id": i, "kind": "short", "status": "rendered", "source_key": chosen["key"]}
    assert len(set(short_first_cycle)) == 5

    # Once all 5 have been posted on LinkedIn, the second cycle resets and covers all 5 again without repeats
    linkedin_second_cycle = []
    for i in range(20, 25):
        chosen = sources.pick_hf_space("linkedin", rng=rng)
        assert chosen["key"] not in linkedin_second_cycle
        linkedin_second_cycle.append(chosen["key"])
        fake_store.rows[i] = {"id": i, "kind": "linkedin", "status": "rendered", "source_key": chosen["key"]}
    assert len(set(linkedin_second_cycle)) == 5


def test_hf_space_prompts_and_hard_checks_require_space_url_and_pymasters():
    sp = sources.hf_space_candidates()[0]
    li_prompt = briefs.linkedin_prompt(sp)
    sh_prompt = briefs.short_prompt(sp)
    assert sp["space_url"] in li_prompt and "pymasters.net" in li_prompt
    assert sp["space_url"] in sh_prompt and "pymasters.net" in sh_prompt

    # Missing HF Space URL is caught by hard_checks for both LinkedIn and Short
    bad_li = {
        "style": "hf_space",
        "is_hf_space": True,
        "space_url": sp["space_url"],
        "post": "A" * 900 + " https://pymasters.net",
        "code_snippet": "print(1)",
        "hashtags": ["#Python", "#AI", "#HuggingFace"],
        "animation": {"title": "AST", "beats": [{"kind": "reveal", "caption": "ok", "big": "AST", "sub": "check"}]},
    }
    errs_li = quality.hard_checks("linkedin", bad_li)
    assert any("Hugging Face Space link" in e for e in errs_li)

    good_li = {**bad_li, "post": "A" * 850 + f" {sp['space_url']} https://pymasters.net"}
    assert not quality.hard_checks("linkedin", good_li)


# ---------- Daily Live Trending Topics across 5 Pillars (owner, 2026-11-10) ----------
from socialbot import trends


def test_daily_trends_capture_all_five_pillars_with_verified_python_code(tmp_path, monkeypatch):
    monkeypatch.setattr(trends, "TRENDS_DIR", tmp_path / "daily_trends")
    monkeypatch.setattr(trends, "OPS_REVIEW_MD", tmp_path / "TRENDS_DAILY.md")
    items = trends.capture_daily_trends(day="2026-11-10", force=True, live_network=False)
    assert [it["pillar_id"] for it in items] == [
        "ai_finance",
        "ai_risk",
        "ai_cards_banking",
        "ai_around_the_world",
        "ai_key_concepts",
    ]
    assert (tmp_path / "TRENDS_DAILY.md").exists()
    for it in items:
        assert it["is_daily_trend"] is True
        assert "How PyMasters helps you master this" in it["story"]
        assert "pymasters.net" in it["story"]
        for code in it["code_blocks"]:
            ok, out, err = quality.run_snippet(code)
            assert ok and out.strip(), f"{it['key']} failed: {err}"
            first_line = out.strip().splitlines()[0].strip()
            assert first_line in it["story"], f"exact output {first_line!r} missing from {it['key']} story"


def test_daily_trend_pillars_rotate_one_by_one_without_repeats(tmp_path, monkeypatch):
    monkeypatch.setattr(trends, "TRENDS_DIR", tmp_path / "daily_trends")
    monkeypatch.setattr(trends, "OPS_REVIEW_MD", tmp_path / "TRENDS_DAILY.md")
    fake_store = _FakeStore()
    monkeypatch.setattr(trends, "store", fake_store)
    rng = random.Random(99)

    seen_pillars = []
    for i in range(1, 6):
        chosen = trends.pick_daily_trend("linkedin", rng=rng, day="2026-11-10", live_network=False)
        assert chosen["pillar_id"] not in seen_pillars
        seen_pillars.append(chosen["pillar_id"])
        fake_store.rows[i] = {"id": i, "kind": "linkedin", "status": "rendered", "source_key": chosen["key"]}
    assert set(seen_pillars) == {
        "ai_finance",
        "ai_risk",
        "ai_cards_banking",
        "ai_around_the_world",
        "ai_key_concepts",
    }


def test_trend_prompts_and_animation_beat_helper_scope(tmp_path, monkeypatch):
    monkeypatch.setattr(trends, "TRENDS_DIR", tmp_path / "daily_trends")
    monkeypatch.setattr(trends, "OPS_REVIEW_MD", tmp_path / "TRENDS_DAILY.md")
    tr = trends.capture_daily_trends(day="2026-11-10", force=True, live_network=False)[0]
    li_p = briefs.linkedin_prompt(tr)
    sh_p = briefs.short_prompt(tr)
    assert "AI in Finance" in li_p and "how @PyMasters helps professionals" in li_p
    assert "AI in Finance" in sh_p and "pymasters.net" in sh_p

    # Animation beat calling a helper defined in code_snippet succeeds via fallback scope
    draft = {
        "style": "trend",
        "post": "A" * 900 + " https://pymasters.net",
        "code_snippet": "def double(x):\n    return x * 2\nprint(double(21))",
        "hashtags": ["#Python", "#AIFinance", "#PyMasters"],
        "animation": {
            "title": "Position Sizing",
            "beats": [{"kind": "code", "caption": "Call helper", "code": "print(double(21))", "output": "42"}],
        },
    }
    assert not quality.hard_checks("linkedin", draft)


def test_weekly_thematic_analysis_cadence_and_verified_research_candidates(tmp_path, monkeypatch):
    c = config.CADENCE["thematic"]
    assert c["per_week"] == 0 and c["weekdays"] == []
    monkeypatch.setattr(trends, "THEMATIC_DIR", tmp_path / "weekly_thematic")
    monkeypatch.setattr(trends, "OPS_THEMATIC_MD", tmp_path / "THEMATIC_WEEKLY.md")
    items = trends.capture_weekly_thematic(week_id="2026-W46", force=True, live_network=False)
    assert len(items) == 3
    assert (tmp_path / "THEMATIC_WEEKLY.md").exists()
    for it in items:
        assert it["is_thematic"] is True
        assert "@PyMasters" in it["story"] and "https://pymasters.net" in it["story"]
        for code in it["code_blocks"]:
            ok, out, err = quality.run_snippet(code)
            assert ok and out.strip(), f"{it['key']} failed: {err}"
            assert out.strip().splitlines()[0].strip() in it["story"]


def test_weekly_thematic_rotates_without_repeats_and_uses_thematic_brief(tmp_path, monkeypatch):
    monkeypatch.setattr(trends, "THEMATIC_DIR", tmp_path / "weekly_thematic")
    monkeypatch.setattr(trends, "OPS_THEMATIC_MD", tmp_path / "THEMATIC_WEEKLY.md")
    fake_store = _FakeStore()
    monkeypatch.setattr(trends, "store", fake_store)
    rng = random.Random(123)
    seen = []
    for i in range(1, 4):
        chosen = trends.pick_weekly_thematic(rng=rng, week_id="2026-W46", live_network=False)
        assert chosen["key"] not in seen
        seen.append(chosen["key"])
        fake_store.rows[i] = {"id": i, "kind": "thematic", "status": "rendered", "source_key": chosen["key"]}
    assert len(set(seen)) == 3

    th = items = trends.capture_weekly_thematic(week_id="2026-W46", live_network=False)[0]
    tp = briefs.thematic_prompt(th)
    cp = briefs.critic_prompt("thematic", {"style": "thematic", "post": "x"}, th)
    assert "Thematic Analysis Research Brief" in tp and "@PyMasters" in tp and "https://pymasters.net" in tp
    assert "Weekly Thematic Analysis Research posts" in cp


def test_youtube_short_rejects_monotonous_visuals_and_accepts_self_explanatory_multi_visuals():
    from socialbot.render import scenes as render_scenes

    monotonous_short = {
        "title": "Why Naive Retries Break Payment APIs",
        "description": "Learn more at https://pymasters.net",
        "tags": ["Python", "AI", "Payments"],
        "scenes": [
            {"narration": f"Scene {i} narration with plenty of words so total word count exceeds sixty words easily across five scenes.",
             "visual": {"type": "code", "heading": f"Step {i}", "code": "print(42)", "output": "42"}}
            for i in range(1, 6)
        ],
    }
    errs = quality.hard_checks("short", monotonous_short)
    assert any("use at least 3 different self-explanatory visual types" in e for e in errs)

    self_explanatory_short = {
        "title": "Why Naive Retries Break Payment APIs",
        "hook": "Why do blind payment retries double-charge customers?",
        "cta": "Practice deterministic Python risk engineering at pymasters.net.",
        "description": "Full lesson at https://pymasters.net",
        "tags": ["Python", "AI", "Payments"],
        "scenes": [
            {
                "narration": "When a payment gateway times out under load, blind retries can charge a customer card twice in under a second.",
                "visual": {
                    "type": "metric",
                    "step_badge": "1 · THE BUSINESS RISK",
                    "heading": "Duplicate Charge Exposure",
                    "note": "Blind retries turn a 300ms timeout into duplicate card settlement.",
                    "metrics": [
                        {"label": "BLIND RETRY", "value": "3.4% Dupes", "sub": "Charged twice on timeout"},
                        {"label": "IDEMPOTENT KEY", "value": "0.0% Dupes", "sub": "Safe deterministic replay"},
                    ],
                },
            },
            {
                "narration": "An idempotency key hashes the user ID, cart items, and timestamp bucket before calling the external gateway.",
                "visual": {
                    "type": "flow",
                    "step_badge": "2 · SYSTEM FLOW",
                    "heading": "Idempotent Payment Pipeline",
                    "note": "Every retry carries the exact same deterministic SHA-256 token.",
                    "nodes": ["Checkout", "SHA-256 Key", "Ledger Lock", "Gateway"],
                    "edges": [[0, 1], [1, 2], [2, 3]],
                },
            },
            {
                "narration": "Here is the exact three-line Python guard that deduplicates payment requests in memory before settlement.",
                "visual": {
                    "type": "code",
                    "step_badge": "3 · LIVE PYTHON GUARD",
                    "heading": "Deterministic Dedup Check",
                    "note": "setdefault returns the cached receipt on any retry.",
                    "code": "seen = {}\ntx = seen.setdefault('k9', 100)\nprint(tx)",
                    "output": "100",
                },
            },
            {
                "narration": "Notice the difference between unguarded retries and idempotent state locking during a gateway timeout.",
                "visual": {
                    "type": "compare",
                    "step_badge": "4 · BEFORE VS AFTER",
                    "heading": "Retry Behavior Under Timeout",
                    "note": "Idempotency guarantees at-most-once settlement.",
                    "left_title": "Naive Retry",
                    "left": "3 timeouts = 3 charges\nCustomer billed $300",
                    "right_title": "Idempotent Key",
                    "right": "3 timeouts = 1 charge\nCached receipt replayed",
                },
            },
            {
                "narration": "Lock the transaction key before the network call so every retry replays the original receipt safely.",
                "visual": {
                    "type": "reveal",
                    "step_badge": "5 · KEY TAKEAWAY",
                    "heading": "Zero Duplicate Charges",
                    "note": "Hash the intent first, then call the payment network.",
                    "big": "1 Key = 1 Charge",
                    "sub": "pymasters.net · AI in Cards & Banking",
                },
            },
        ],
    }
    assert not quality.hard_checks("short", self_explanatory_short)

    # Verify draw_frame renders step_badge, metric cards, and note banner cleanly in 1080x1920 and 1080x1080
    f_portrait = render_scenes.Frame(1080, 1920)
    f_square = render_scenes.Frame(1080, 1080)
    sample_words = [("Idempotency", 0.0, 0.4), ("locks", 0.4, 0.8), ("settlement.", 0.8, 1.2)]
    for sc in self_explanatory_short["scenes"]:
        img_portrait = render_scenes.draw_frame(f_portrait, sc["visual"], 0.6, 0.5, words=sample_words, now=0.5)
        assert img_portrait.size == (1080, 1920)
        img_square = render_scenes.draw_frame(f_square, sc["visual"], 0.6, 0.5, caption="Self-explanatory takeaway")
        assert img_square.size == (1080, 1080)


def test_never_uses_hindi_words_while_permitting_tamil_and_plain_english():
    for hindi_word in ("chai", "samosa", "tapri", "jugaad", "paisa", "lakh", "crore", "namaste", "तत्काल"):
        bad_draft = {
            "style": "business_story",
            "post": "A" * 850 + f" {hindi_word} @PyMasters https://pymasters.net",
            "code_snippet": "",
            "hashtags": ["#AI", "#Python", "#PyMasters"],
            "animation": {"title": "Plain English Check", "beats": [{"kind": "reveal", "caption": "ok", "big": "OK", "sub": "ok"}]},
        }
        errs = quality.hard_checks("linkedin", bad_draft)
        assert errs, f"expected hard_checks to reject Hindi word: {hindi_word}"

    # Verify Tamil words (vanakkam, nanba, vaathiyaar) are permitted alongside plain English
    tamil_permitted_draft = {
        "style": "business_story",
        "post": "A" * 850 + " Vanakkam nanba, Vaathiyaar explains AI risk with @PyMasters https://pymasters.net",
        "code_snippet": "",
        "hashtags": ["#AI", "#Python", "#PyMasters"],
        "animation": {"title": "Plain English Check", "beats": [{"kind": "reveal", "caption": "ok", "big": "OK", "sub": "ok"}]},
    }
    assert not quality.hard_checks("linkedin", tamil_permitted_draft)

    # Verify little_text normalizes fancy Unicode hyphens/spaces to plain ASCII English
    normalized = linkedin.little_text("Real\u2011time latency: 50\u202fms with @PyMasters https://pymasters.net", ["#Python", "#AI", "#Risk"])
    assert "\u2011" not in normalized and "\u202f" not in normalized
    assert "Real-time latency: 50 ms" in normalized


def test_simple_non_technical_topic_weights_and_shares():
    assert config.SIMPLICITY_MIN_SCORE >= 7.5
    assert config.HF_SPACE_SHARE <= 0.15
    assert config.TREND_SHARE <= 0.25
    assert sources.TRACK_WEIGHT["python_fundamentals"] > sources.TRACK_WEIGHT["python_internals"]
    assert sources.TRACK_WEIGHT["ai_fundamentals"] > sources.TRACK_WEIGHT["transformers_scratch"]
    assert sources.TRACK_WEIGHT["working_with_data"] > sources.TRACK_WEIGHT["ai_engineering"]


def test_video_prompts_and_critic_enforce_non_technical_simplicity(monkeypatch):
    sp = briefs.short_prompt(LES)
    lp = briefs.long_prompt(LES)
    assert "non-technical person" in sp.lower()
    assert "zero technical background" in lp.lower()

    sample_short = {
        "title": "How Smart Lists Save Memory",
        "hook": "Imagine reading a giant book one page at a time.",
        "cta": "Learn Python in simple steps at pymasters.net.",
        "description": "See how lazy lists work step by step at https://pymasters.net",
        "tags": ["Python", "Beginners", "PyMasters"],
        "scenes": [
            {"narration": "Loading every item at once fills up your computer memory fast when lists grow very large in daily apps.",
             "visual": {"type": "metric", "step_badge": "1 · PROBLEM", "note": "Loading all items wastes memory.",
                        "heading": "Why Memory Fills Up",
                        "metrics": [{"label": "ALL AT ONCE", "value": "1M items"}, {"label": "ONE BY ONE", "value": "1 item"}]}},
            {"narration": "Instead, imagine pulling one ticket at a time from a counter dispenser only when a person asks for it.",
             "visual": {"type": "flow", "step_badge": "2 · ANALOGY", "note": "Take only the next ticket needed.",
                        "heading": "One Ticket At A Time",
                        "nodes": ["Ask Next", "Give One", "Repeat"], "edges": [[0, 1, "step"], [1, 2, "next"]]}},
            {"narration": "In Python, we just write a simple rule that hands back one clean number at a time when needed.",
             "visual": {"type": "code", "step_badge": "3 · SIMPLE PYTHON", "note": "Creates items only when asked.",
                        "heading": "Simple Python Example",
                        "code": "nums = (x*2 for x in [1,2,3])\nprint(next(nums))", "output": "2"}},
            {"narration": "Because it works step by step like a calm queue, even small laptops stay fast and never freeze up.",
             "visual": {"type": "compare", "step_badge": "4 · IMPACT", "note": "Fast results without hogging memory.",
                        "heading": "All At Once vs One By One", "style": "versus",
                        "left_title": "Loads All", "right_title": "One By One",
                        "left": "Slow startup", "right": "Instant response"}},
            {"narration": "Give your program only the single piece it needs right now, and leave everything else waiting quietly until called.",
             "visual": {"type": "reveal", "step_badge": "5 · RULE", "note": "Keep only what you use right now.",
                        "heading": "Main Takeaway", "big": "Load One Item At A Time", "sub": "pymasters.net"}},
        ],
    }
    assert not quality.hard_checks("short", sample_short)
    crit = briefs.critic_prompt("short", sample_short, LES)
    assert "non-technical" in crit.lower()
    assert "TECHNICAL AUDIENCE track" not in crit

    # Low simplicity score must reject the Short even if overall score is high
    monkeypatch.setattr(
        quality, "critique",
        lambda kind, draft, les: {
            "scores": {"hook": 8, "accuracy": 9, "specificity": 8, "clarity": 7, "originality": 8, "brand_rules": 9, "simplicity": 6.0},
            "overall": 8.0, "factual_errors": [], "blocking_issues": [], "polish": [],
        },
    )
    ok, _, _, problems = quality.verdict("short", sample_short, LES)
    assert ok is False and any("simplicity" in p.lower() for p in problems)

    # High simplicity + high overall passes cleanly
    monkeypatch.setattr(
        quality, "critique",
        lambda kind, draft, les: {
            "scores": {"hook": 8.5, "accuracy": 9, "specificity": 8.5, "clarity": 9, "originality": 8, "brand_rules": 9, "simplicity": 8.5},
            "overall": 8.5, "factual_errors": [], "blocking_issues": [], "polish": [],
        },
    )
    ok2, _, _, problems2 = quality.verdict("short", sample_short, LES)
    assert ok2 is True and not problems2
