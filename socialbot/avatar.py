"""Pluggable talking-head presenter avatar adapters (HeyGen primary, Tavus & Synthesia supported)."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

from socialbot import config

log = logging.getLogger("socialbot.avatar")


class AvatarUnavailableError(RuntimeError):
    """Raised when an external avatar provider is unconfigured or rejects a request."""


@dataclass
class AvatarRenderResult:
    provider: str
    job_id: str
    video_path: Path
    duration_s: float = 0.0
    remote_url: str = ""


class HeyGenAdapter:
    name = "heygen"
    base_url = "https://api.heygen.com"

    def __init__(self, api_key: str = "", avatar_id: str = "", voice_id: str = ""):
        self.api_key = (api_key or config.HEYGEN_API_KEY).strip()
        self.avatar_id = (avatar_id or config.HEYGEN_AVATAR_ID).strip()
        self.voice_id = (voice_id or config.HEYGEN_VOICE_ID).strip()

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise AvatarUnavailableError("HEYGEN_API_KEY is not configured.")
        return {"X-Api-Key": self.api_key, "Content-Type": "application/json"}

    def create_talk(self, script_text: str, title: str = "", width: int = 1280, height: int = 720) -> str:
        payload = {
            "title": title[:80] or "PyMasters Explainer",
            "dimension": {"width": width, "height": height},
            "video_inputs": [
                {
                    "character": {
                        "type": "avatar",
                        "avatar_id": self.avatar_id,
                        "avatar_style": "normal",
                    },
                    "voice": {
                        "type": "text",
                        "input_text": script_text,
                        **({"voice_id": self.voice_id} if self.voice_id else {}),
                    },
                }
            ],
        }
        r = requests.post(
            f"{self.base_url}/v2/video/generate",
            headers=self._headers(),
            json=payload,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json().get("data") or {}
        vid = data.get("video_id")
        if not vid:
            raise AvatarUnavailableError(f"HeyGen response missing video_id: {r.text[:240]}")
        return str(vid)

    def poll_status(self, job_id: str) -> dict:
        r = requests.get(
            f"{self.base_url}/v1/video_status.get",
            headers=self._headers(),
            params={"video_id": job_id},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json().get("data") or {}
        status = (data.get("status") or "").lower()
        return {
            "status": status,
            "video_url": data.get("video_url") or "",
            "duration_s": float(data.get("duration") or 0.0),
            "error": data.get("error") or "",
        }


class TavusAdapter:
    name = "tavus"
    base_url = "https://tavusapi.com/v2"

    def __init__(self, api_key: str = "", replica_id: str = ""):
        self.api_key = (api_key or config.TAVUS_API_KEY).strip()
        self.replica_id = (replica_id or config.TAVUS_REPLICA_ID).strip()

    def _headers(self) -> dict[str, str]:
        if not self.api_key or not self.replica_id:
            raise AvatarUnavailableError("TAVUS_API_KEY and TAVUS_REPLICA_ID must be configured.")
        return {"x-api-key": self.api_key, "Content-Type": "application/json"}

    def create_talk(self, script_text: str, title: str = "", width: int = 1280, height: int = 720) -> str:  # noqa: ARG002
        r = requests.post(
            f"{self.base_url}/videos",
            headers=self._headers(),
            json={"replica_id": self.replica_id, "script": script_text, "video_name": title[:80]},
            timeout=30,
        )
        r.raise_for_status()
        vid = r.json().get("video_id")
        if not vid:
            raise AvatarUnavailableError("Tavus response missing video_id")
        return str(vid)

    def poll_status(self, job_id: str) -> dict:
        r = requests.get(f"{self.base_url}/videos/{job_id}", headers=self._headers(), timeout=20)
        r.raise_for_status()
        data = r.json()
        st = (data.get("status") or "").lower()
        norm = "completed" if st in {"ready", "completed"} else ("failed" if st in {"error", "failed"} else st)
        return {
            "status": norm,
            "video_url": data.get("download_url") or data.get("hosted_url") or "",
            "duration_s": float(data.get("duration") or 0.0),
            "error": data.get("status_details") or "",
        }


class SynthesiaAdapter:
    name = "synthesia"
    base_url = "https://api.synthesia.io/v2"

    def __init__(self, api_key: str = "", avatar_id: str = ""):
        self.api_key = (api_key or config.SYNTHESIA_API_KEY).strip()
        self.avatar_id = (avatar_id or config.SYNTHESIA_AVATAR_ID or "anna_costume1_cameraA").strip()

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise AvatarUnavailableError("SYNTHESIA_API_KEY is not configured.")
        return {"Authorization": self.api_key, "Content-Type": "application/json"}

    def create_talk(self, script_text: str, title: str = "", width: int = 1280, height: int = 720) -> str:  # noqa: ARG002
        r = requests.post(
            f"{self.base_url}/videos",
            headers=self._headers(),
            json={
                "test": False,
                "title": title[:80] or "PyMasters Explainer",
                "input": [{"scriptText": script_text, "avatar": self.avatar_id, "background": "off_white"}],
            },
            timeout=30,
        )
        r.raise_for_status()
        vid = r.json().get("id")
        if not vid:
            raise AvatarUnavailableError("Synthesia response missing video id")
        return str(vid)

    def poll_status(self, job_id: str) -> dict:
        r = requests.get(f"{self.base_url}/videos/{job_id}", headers=self._headers(), timeout=20)
        r.raise_for_status()
        data = r.json()
        st = (data.get("status") or "").lower()
        norm = "completed" if st == "complete" else ("failed" if st in {"error", "failed", "rejected"} else st)
        return {
            "status": norm,
            "video_url": data.get("download") or "",
            "duration_s": float(data.get("duration") or 0.0),
            "error": data.get("error") or "",
        }


class GoogleZeroCostAvatarAdapter:
    """Zero-extra-cost presenter adapter (`$0.00`):
    1. Reuses any exported Google Vids / Veo AI Avatar MP4 placed in `~/GoogleDrive/PyMasters Social Content/Presenter Plates/`
       or `config.PRESENTER_PLATES_DIR` matching the title/slug.
    2. Otherwise renders our consistent Studio `Vaathiyaar` presenter synced to `$0.00` `gemini-2.5-flash-preview-tts`
       (with automatic local `Kokoro-82M` fallback)."""

    name = "google_zero_cost"

    def render_local(self, script_text: str, out_mp4: Path, title: str = "", width: int = 1280, height: int = 720) -> AvatarRenderResult:
        import re
        import shutil
        from socialbot.render import presenter_overlay as PO

        slug = re.sub(r"[^a-z0-9]+", "_", (title or "").lower()).strip("_")
        drive_plates = Path.home() / "GoogleDrive" / config.DRIVE_ROOT_FOLDER / "Presenter Plates"
        for folder in (config.PRESENTER_PLATES_DIR, drive_plates):
            if slug and folder.is_dir():
                cand = folder / f"{slug}.mp4"
                if cand.is_file():
                    out_mp4.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(cand, out_mp4)
                    return AvatarRenderResult(provider=self.name, job_id=f"plate:{slug}", video_path=out_mp4)

        _, dur_s = PO.render_studio_presenter_mp4(script_text, out_mp4, width=width, height=height)
        return AvatarRenderResult(provider=self.name, job_id="studio_vaathiyaar_zero_cost", video_path=out_mp4, duration_s=dur_s)


def get_avatar_adapter(provider: Optional[str] = None):
    name = (provider or config.AVATAR_PROVIDER or "google_zero_cost").strip().lower()
    if name in ("google_zero_cost", "gemini", "studio"):
        return GoogleZeroCostAvatarAdapter()
    if name == "heygen":
        return HeyGenAdapter()
    if name == "tavus":
        return TavusAdapter()
    if name == "synthesia":
        return SynthesiaAdapter()
    raise ValueError(f"Unsupported avatar provider '{name}'. Choose google_zero_cost, heygen, tavus, or synthesia.")


def render_talking_head(
    script_text: str,
    out_mp4: Path,
    title: str = "",
    provider: Optional[str] = None,
    timeout_s: int = 360,
    poll_s: int = 5,
    width: int = 1280,
    height: int = 720,
) -> AvatarRenderResult:
    """Create, poll, and download (or zero-cost synthesize) a talking-head MP4 via the configured avatar provider."""
    adapter = get_avatar_adapter(provider)
    if isinstance(adapter, GoogleZeroCostAvatarAdapter):
        return adapter.render_local(script_text, out_mp4, title=title, width=width, height=height)
    job_id = adapter.create_talk(script_text, title=title, width=width, height=height)
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        info = adapter.poll_status(job_id)
        if info["status"] == "completed" and info["video_url"]:
            out_mp4.parent.mkdir(parents=True, exist_ok=True)
            with requests.get(info["video_url"], stream=True, timeout=60) as resp:
                resp.raise_for_status()
                with out_mp4.open("wb") as fh:
                    for chunk in resp.iter_content(chunk_size=131072):
                        if chunk:
                            fh.write(chunk)
            return AvatarRenderResult(
                provider=adapter.name,
                job_id=job_id,
                video_path=out_mp4,
                duration_s=info.get("duration_s", 0.0),
                remote_url=info["video_url"],
            )
        if info["status"] == "failed":
            raise AvatarUnavailableError(f"{adapter.name} video failed: {info.get('error')}")
        time.sleep(poll_s)
    raise AvatarUnavailableError(f"{adapter.name} video {job_id} timed out after {timeout_s}s.")
