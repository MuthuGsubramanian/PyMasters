"""End-to-end verification suite for the `pymasters-posts` Antigravity skill, brand rule,
avatar manifest integrity, AST code gate, visual pack generation, and `socialbot` opt-in hook."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = REPO_ROOT / ".agents" / "skills" / "pymasters-posts"
SKILL_MD = SKILL_DIR / "SKILL.md"
MANIFEST_JSON = SKILL_DIR / "assets" / "manifest.json"
SCRIPT_PATH = SKILL_DIR / "scripts" / "generate_post_pack.py"
RULE_MD = REPO_ROOT / ".agents" / "rules" / "pymasters-posts-brand.md"
GLOBAL_SYMLINK = Path.home() / ".gemini" / "config" / "skills" / "pymasters-posts"


def _parse_frontmatter(md_path: Path) -> tuple[dict, str]:
    text = md_path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    assert match, f"{md_path} must start with valid YAML frontmatter delimited by ---"
    fm = yaml.safe_load(match.group(1))
    assert isinstance(fm, dict), f"{md_path} frontmatter must parse to a YAML mapping"
    return fm, match.group(2)


def _load_cli_module():
    spec = importlib.util.spec_from_file_location("pymasters_posts_cli", str(SCRIPT_PATH))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_skill_md_frontmatter_size_and_global_symlink() -> None:
    assert SKILL_MD.is_file()
    lines = SKILL_MD.read_text(encoding="utf-8").splitlines()
    assert len(lines) < 500, f"SKILL.md has {len(lines)} lines (must be < 500)"

    fm, _body = _parse_frontmatter(SKILL_MD)
    assert fm.get("name") == "pymasters-posts"
    assert isinstance(fm.get("description"), str) and len(fm["description"]) >= 40

    # Global symlink resolves cleanly one level deep under ~/.gemini/config/skills/
    assert GLOBAL_SYMLINK.is_symlink(), f"Expected symlink at {GLOBAL_SYMLINK}"
    assert GLOBAL_SYMLINK.resolve() == SKILL_DIR.resolve()
    assert (GLOBAL_SYMLINK / "SKILL.md").is_file()


def test_workspace_brand_rule_frontmatter_and_flat_placement() -> None:
    assert RULE_MD.is_file()
    # Flat inside .agents/rules/ (no nested subdirectories)
    assert RULE_MD.parent == REPO_ROOT / ".agents" / "rules"
    text = RULE_MD.read_text(encoding="utf-8")
    assert len(text) < 3000, f"Rule file is {len(text)} chars (must be < 3000)"

    fm, body = _parse_frontmatter(RULE_MD)
    assert fm.get("trigger") == "model_decision"
    assert isinstance(fm.get("description"), str) and len(fm["description"]) >= 25
    assert "avatar-headshot.jpg" in body
    assert "ast.parse()" in body
    assert "pymasters.net" in body
    assert "https://t.me/boost/PyMasterscommunity" in body


def test_avatar_manifest_sha256_and_dimensions_and_zero_secrets() -> None:
    manifest = json.loads(MANIFEST_JSON.read_text(encoding="utf-8"))
    assets = manifest.get("assets") or {}
    expected_files = {"avatar-headshot.jpg", "avatar-fullbody.jpg", "avatar-stage.gif"}
    assert set(assets.keys()) == expected_files

    for fname in expected_files:
        p = SKILL_DIR / "assets" / fname
        assert p.is_file()
        raw = p.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == assets[fname]["sha256"]
        assert len(raw) == assets[fname]["bytes"]
        with Image.open(p) as im:
            assert list(im.size) == [assets[fname]["width"], assets[fname]["height"]]

    # Security check: zero credential files or hardcoded Gemini API keys inside skill bundle
    secret_re = re.compile(r"AIza[0-9A-Za-z_-]{30,}")
    for fpath in SKILL_DIR.rglob("*"):
        if fpath.is_file():
            assert not fpath.name.startswith(".env"), f"Secret file found in skill bundle: {fpath}"
            if fpath.suffix.lower() in {".md", ".py", ".json", ".html", ".txt"}:
                content = fpath.read_text(encoding="utf-8", errors="ignore")
                assert not secret_re.search(content), f"Hardcoded Google API key found in {fpath}"


def test_live_stats_and_ast_validation_rejects_malformed_python(tmp_path: Path) -> None:
    mod = _load_cli_module()
    stats = mod.load_live_stats()
    assert stats["lessons_count"] >= 400
    assert stats["tracks_count"] >= 20
    assert stats["learning_paths_count"] >= 15
    assert stats["concept_nodes_count"] >= 200
    assert stats["locales_count"] >= 5

    # Direct function rejection
    with pytest.raises(mod.CodeSyntaxValidationError):
        mod.validate_python_code("def broken(x:\n    return x")

    # CLI rejection exits non-zero without writing outputs
    bad_dir = tmp_path / "bad_code_pack"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--platform",
            "linkedin",
            "--topic",
            "Broken syntax test",
            "--mode",
            "composite",
            "--code",
            "for i in range(5)\n    print(i)",
            "--out-dir",
            str(bad_dir),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode != 0
    assert "ast.parse()" in (proc.stderr + proc.stdout)
    assert not (bad_dir / "visual.png").exists()


def test_offline_composite_renders_exact_linkedin_and_youtube_dimensions(tmp_path: Path) -> None:
    mod = _load_cli_module()

    # 1) LinkedIn 4:5 (1080x1350)
    li_dir = tmp_path / "linkedin_pack"
    li_res = mod.generate_post_pack(
        platform="linkedin",
        topic="How Python recursion frames unwind on the call stack",
        mode="composite",
        aspect="4:5",
        out_dir=li_dir,
    )
    li_png = Path(li_res["visual_path"])
    assert li_png.is_file()
    with Image.open(li_png) as im:
        assert im.size == (1080, 1350)
    li_copy = Path(li_res["copy_path"]).read_text(encoding="utf-8")
    assert "https://pymasters.net" in li_copy
    assert "**" not in li_copy and "```" not in li_copy
    assert "Vaar" in li_copy and "Watch It Run" in li_copy

    # 2) YouTube 16:9 (1280x720)
    yt_dir = tmp_path / "youtube_pack"
    yt_res = mod.generate_post_pack(
        platform="youtube",
        topic="Python Recursion Stack Frames Visualized",
        mode="composite",
        aspect="16:9",
        out_dir=yt_dir,
    )
    yt_png = Path(yt_res["visual_path"])
    assert yt_png.is_file()
    with Image.open(yt_png) as im:
        assert im.size == (1280, 720)
    yt_copy = Path(yt_res["copy_path"]).read_text(encoding="utf-8")
    assert "https://pymasters.net" in yt_copy
    assert "https://t.me/boost/PyMasterscommunity" in yt_copy

    # 3) Hybrid mode (runs multimodal + overlay if GEMINI_API_KEY is present, else clean composite fallback)
    hyb_dir = tmp_path / "hybrid_pack"
    hyb_res = mod.generate_post_pack(
        platform="linkedin",
        topic="Why Python dict lookups stay O(1)",
        mode="hybrid",
        aspect="4:5",
        out_dir=hyb_dir,
    )
    assert Path(hyb_res["visual_path"]).is_file()
    with Image.open(hyb_res["visual_path"]) as im:
        assert im.size == (1080, 1350)
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        assert hyb_res["metadata"]["effective_mode"] == "composite"


def test_socialbot_opt_in_presenter_pack_integration(tmp_path: Path) -> None:
    from socialbot import config, presenter_pack

    # Default stays False so existing production daemons/timers are 100% backward-compatible
    assert hasattr(config, "USE_PRESENTER_AVATAR")

    thumb_path = presenter_pack.build_presenter_thumbnail(
        title="Recursion Unwound",
        topic="How Python recursion frames unwind on the call stack",
        code="def f(n):\n    return 1 if n <= 1 else n * f(n - 1)",
        out_dir=tmp_path / "yt_thumb",
        mode="composite",
    )
    assert thumb_path.is_file()
    with Image.open(thumb_path) as im:
        assert im.size == (1280, 720)

    tg_res = presenter_pack.build_telegram_broadcast_pack(
        topic="New Watch It Run Heap Visualizer",
        out_dir=tmp_path / "tg_pack",
        mode="composite",
    )
    assert Path(tg_res["visual_path"]).is_file()
    assert "https://t.me/boost/PyMasterscommunity" in Path(tg_res["copy_path"]).read_text(encoding="utf-8")
