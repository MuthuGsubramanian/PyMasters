"""Hugging Face Inference API service wrappers.

This module provides simple functions to generate images and videos
using Hugging Face Inference endpoints. It uses the HUGGINGFACEHUB_API_TOKEN
from config.settings to authenticate requests.
"""
from __future__ import annotations

import io
import json
import time
from dataclasses import dataclass
from typing import Optional, Tuple

import requests

from config.settings import settings


HF_API_BASE = "https://api-inference.huggingface.co/models"


class HuggingFaceError(RuntimeError):
    pass


def _auth_headers() -> dict[str, str]:
    token = settings.huggingfacehub_api_token
    if not token:
        raise HuggingFaceError(
            "Missing HUGGINGFACEHUB_API_TOKEN. Set it in your environment or .env."
        )
    return {"Authorization": f"Bearer {token}"}


@dataclass
class ImageResult:
    bytes: bytes
    mime_type: str


@dataclass
class VideoResult:
    bytes: bytes
    mime_type: str  # usually video/mp4 or application/octet-stream


def generate_image(*, prompt: str, model: str) -> ImageResult:
    """Generate an image for the given prompt using a text-to-image model.

    Returns raw bytes and mime type suitable for writing to a file or st.image.
    """
    url = f"{HF_API_BASE}/{model}"
    headers = {"Accept": "application/json", **_auth_headers()}
    payload = {"inputs": prompt}

    resp = requests.post(url, headers=headers, json=payload, timeout=120)

    # Handle loading state
    if resp.status_code == 503:
        # model loading — retry once after suggested wait time
        try:
            info = resp.json()
            wait = float(info.get("estimated_time", 10))
        except Exception:
            wait = 10
        time.sleep(min(wait, 30))
        resp = requests.post(url, headers=headers, json=payload, timeout=120)

    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HuggingFaceError(f"Image generation failed: {resp.status_code} {detail}")

    ctype = resp.headers.get("content-type", "application/octet-stream")
    return ImageResult(bytes=resp.content, mime_type=ctype)


def generate_video(*, prompt: str, model: str, poll: bool = True, max_wait: int = 300) -> VideoResult:
    """Generate a video for the given prompt using a text-to-video model.

    For many public models the first call returns 503 while the model warms up.
    If poll=True, we will wait/poll once to retrieve a result, up to max_wait seconds.
    """
    url = f"{HF_API_BASE}/{model}"
    headers = {"Accept": "application/json", **_auth_headers()}
    payload = {"inputs": prompt}

    start = time.time()
    attempt = 0
    while True:
        attempt += 1
        resp = requests.post(url, headers=headers, json=payload, timeout=300)

        if resp.status_code == 503 and poll:
            try:
                info = resp.json()
                wait = float(info.get("estimated_time", 15))
            except Exception:
                wait = 15
            if time.time() - start + wait > max_wait:
                # give up and return a friendly error
                raise HuggingFaceError(
                    "Video model is warming up. Please try again shortly."
                )
            time.sleep(min(wait, 30))
            continue

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise HuggingFaceError(f"Video generation failed: {resp.status_code} {detail}")

        ctype = resp.headers.get("content-type", "application/octet-stream")
        return VideoResult(bytes=resp.content, mime_type=ctype)

