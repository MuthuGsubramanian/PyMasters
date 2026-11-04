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


def test_fun_with_python_prompt_asks_for_a_playful_real_world_example():
    p = briefs.linkedin_prompt(LES, style="fun")
    assert "Fun with Python" in p
    assert "real-world" in p
    assert LES["url"] in p
    assert "jargon, made simple" not in p


def test_default_prompt_keeps_the_jargon_made_simple_format():
    assert "jargon, made simple" in briefs.linkedin_prompt(LES)


def test_linkedin_style_is_picked_at_random_with_both_formats_appearing():
    rng = random.Random(7)
    styles = {pipeline.linkedin_style(rng) for _ in range(50)}
    assert styles == {"fun", "jargon"}


def test_the_editor_judges_a_fun_post_by_the_fun_rules():
    fun = briefs.critic_prompt("linkedin", {"style": "fun", "post": "x"}, LES)
    jargon = briefs.critic_prompt("linkedin", {"style": "jargon", "post": "x"}, LES)
    assert "Fun with Python" in fun and "everyday" in fun
    assert "original, precise analogy" in jargon
    assert "original, precise analogy" not in fun
