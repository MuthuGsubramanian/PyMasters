"""Opt-in bridge between `socialbot` and the `.agents/skills/pymasters-posts` presenter-anchored post-pack CLI.

Backward-compatible: only activated when `config.USE_PRESENTER_AVATAR` (`PMSOCIAL_USE_PRESENTER_AVATAR=1`)
or `--presenter-avatar` is explicitly enabled, leaving existing systemd timers and thermal guards untouched."""
from __future__ import annotations

import importlib.util
import logging
from pathlib import Path
from typing import Any

from socialbot import config

log = logging.getLogger("socialbot.presenter_pack")

SKILL_SCRIPT = config.REPO / ".agents" / "skills" / "pymasters-posts" / "scripts" / "generate_post_pack.py"


def _load_generator_module():
    if not SKILL_SCRIPT.is_file():
        raise FileNotFoundError(f"pymasters-posts generator script not found at {SKILL_SCRIPT}")
    spec = importlib.util.spec_from_file_location("pymasters_posts_generator", str(SKILL_SCRIPT))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module spec for {SKILL_SCRIPT}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_presenter_thumbnail(
    *,
    title: str,
    topic: str,
    code: str,
    out_dir: Path,
    mode: str = "hybrid",
) -> Path:
    """Render a `1280x720` YouTube thumbnail anchored on `avatar-headshot.jpg` and convert to `thumb.jpg`."""
    from PIL import Image

    mod = _load_generator_module()
    pack_dir = Path(out_dir) / "presenter_thumb_pack"
    res = mod.generate_post_pack(
        platform="youtube",
        topic=topic or title,
        headline=title,
        code=code or "",
        mode=mode,
        aspect="16:9",
        avatar="headshot",
        out_dir=pack_dir,
    )
    png_path = Path(res["visual_path"])
    jpg_path = Path(out_dir) / "thumb.jpg"
    with Image.open(png_path) as im:
        im.convert("RGB").save(jpg_path, format="JPEG", quality=92)
    return jpg_path


def build_linkedin_presenter_pack(
    *,
    topic: str,
    code: str,
    out_dir: Path,
    mode: str = "hybrid",
    aspect: str = "4:5",
) -> dict[str, Any]:
    """Generate a presenter-anchored LinkedIn visual card + metadata bundle alongside the LinkedIn loop."""
    mod = _load_generator_module()
    return mod.generate_post_pack(
        platform="linkedin",
        topic=topic,
        code=code or "",
        mode=mode,
        aspect=aspect,
        out_dir=Path(out_dir) / "presenter_linkedin_pack",
    )


def build_telegram_broadcast_pack(
    *,
    topic: str,
    out_dir: Path,
    code: str = "",
    mode: str = "hybrid",
    motion: bool = False,
) -> dict[str, Any]:
    """Generate a presenter-anchored Telegram community broadcast pack (`post_copy.md` + visual + metadata)."""
    mod = _load_generator_module()
    return mod.generate_post_pack(
        platform="telegram",
        topic=topic,
        code=code,
        mode=mode,
        aspect="9:16" if motion else "4:5",
        avatar="stage" if motion else "auto",
        motion=motion,
        out_dir=Path(out_dir),
    )
