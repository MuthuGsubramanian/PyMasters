"""Google Drive backup & sync for generated PyMasters posts, YouTube Shorts, and Videos."""
import hashlib
import json
import logging
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

from socialbot import config, store

log = logging.getLogger("socialbot.drive")

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]
GCLOUD_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
DEFAULT_QUOTA_PROJECT = os.getenv("PMSOCIAL_DRIVE_QUOTA_PROJECT", "pymasters-app")
TOKEN_FILE = config.CONFIG_DIR / "drive_token.json"
CATEGORY_FOLDERS = {
    "linkedin": "Posts",
    "thematic": "Posts",
    "short": "Shorts",
    "long": "Videos",
}
MIME_TYPES = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".srt": "text/plain",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".wav": "audio/wav",
}


def client_file() -> Path:
    """Return the external Desktop OAuth client JSON path (`drive_client.json`), if configured."""
    return config.CONFIG_DIR / "drive_client.json"


def is_authorised() -> bool:
    """Return True if Google Drive credentials (OAuth token or gcloud Drive mode) are configured."""
    return TOKEN_FILE.exists()


def _gcloud_access_token(account: str) -> str:
    """Fetch a fresh Google Drive access token via gcloud without changing the active gcloud account."""
    cmd = ["gcloud", "auth", "print-access-token", f"--account={account}", f"--scopes={GCLOUD_DRIVE_SCOPE}"]
    try:
        tok = subprocess.check_output(cmd, text=True, stderr=subprocess.PIPE, timeout=20).strip()
        if tok:
            return tok
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            f"Google Drive gcloud token unavailable for {account}: {(e.stderr or '').strip()[:240]}"
        ) from e
    raise RuntimeError(f"Empty access token returned by gcloud for {account}")


def _gcloud_credentials(account: str, quota_project: str = DEFAULT_QUOTA_PROJECT):
    from google.auth import credentials as ga_creds

    class _GcloudDriveCreds(ga_creds.Credentials):
        def __init__(self):
            super().__init__()
            self._quota_project_id = quota_project
            self.token = None
            self.expiry = None

        @property
        def quota_project_id(self):
            return self._quota_project_id

        def refresh(self, request):
            self.token = _gcloud_access_token(account)
            self.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=50)

    c = _GcloudDriveCreds()
    c.refresh(None)
    return c


def _creds():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    if not TOKEN_FILE.exists():
        raise RuntimeError(
            "Google Drive is not authorised yet: run `python -m socialbot auth drive`"
        )
    raw = json.loads(TOKEN_FILE.read_text())
    if raw.get("mode") == "gcloud":
        account = raw.get("account") or config.GOOGLE_DRIVE_EMAIL
        return _gcloud_credentials(account, raw.get("quota_project") or DEFAULT_QUOTA_PROJECT)
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds.valid:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json())
        TOKEN_FILE.chmod(0o600)
    return creds


def client():
    """Return an authenticated Google Drive API v3 client."""
    from googleapiclient.discovery import build

    return build("drive", "v3", credentials=_creds(), cache_discovery=False)


def account_email(svc=None) -> str:
    """Return the authenticated Google Drive account email address."""
    svc = svc or client()
    about = svc.about().get(fields="user(emailAddress,displayName)").execute()
    return ((about.get("user") or {}).get("emailAddress") or "").strip()


def _verify_account(svc):
    expected = (config.GOOGLE_DRIVE_EMAIL or "").strip().lower()
    if not expected:
        return ""
    actual = account_email(svc).lower()
    if actual != expected:
        raise RuntimeError(
            f"Google Drive token belongs to {actual!r}, expected {expected!r}. "
            "Re-run `python -m socialbot auth drive` and choose " + expected
        )
    return actual


def _load_manifest() -> dict:
    if config.DRIVE_MANIFEST_PATH.exists():
        try:
            data = json.loads(config.DRIVE_MANIFEST_PATH.read_text())
            if isinstance(data, dict):
                data.setdefault("folders", {})
                data.setdefault("items", {})
                return data
        except Exception:
            pass
    return {"folders": {}, "items": {}}


def _save_manifest(manifest: dict):
    config.ensure_dirs()
    tmp = config.DRIVE_MANIFEST_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True))
    os.replace(tmp, config.DRIVE_MANIFEST_PATH)


def _escape_q(val: str) -> str:
    return (val or "").replace("\\", "\\\\").replace("'", "\\'")


def _slug(text: str, max_len: int = 48) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "item").strip()).strip("-").lower()
    return (s[:max_len].strip("-") or "item")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _ensure_folder(svc, name: str, parent_id: str | None = None, app_props: dict | None = None) -> str:
    clauses = [
        "mimeType='application/vnd.google-apps.folder'",
        "trashed=false",
        f"name='{_escape_q(name)}'",
    ]
    if parent_id:
        clauses.append(f"'{_escape_q(parent_id)}' in parents")
    resp = svc.files().list(
        q=" and ".join(clauses),
        spaces="drive",
        fields="files(id,name)",
        pageSize=5,
    ).execute()
    files = resp.get("files") or []
    if files:
        return files[0]["id"]
    body = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        body["parents"] = [parent_id]
    if app_props:
        body["appProperties"] = {k: str(v) for k, v in app_props.items()}
    created = svc.files().create(body=body, fields="id").execute()
    return created["id"]


def _ensure_category_folders(svc, manifest: dict) -> dict[str, str]:
    folders = manifest.setdefault("folders", {})
    root_id = folders.get("root")
    if not root_id:
        root_id = _ensure_folder(svc, config.DRIVE_ROOT_FOLDER, app_props={"pymasters_role": "root"})
        folders["root"] = root_id
    for cat in ("Posts", "Shorts", "Videos"):
        if not folders.get(cat):
            folders[cat] = _ensure_folder(
                svc, cat, parent_id=root_id, app_props={"pymasters_role": f"category:{cat.lower()}"}
            )
    return folders


def _find_file(svc, name: str, parent_id: str) -> str | None:
    q = (
        f"name='{_escape_q(name)}' and '{_escape_q(parent_id)}' in parents "
        "and trashed=false and mimeType!='application/vnd.google-apps.folder'"
    )
    resp = svc.files().list(q=q, spaces="drive", fields="files(id,name)", pageSize=5).execute()
    files = resp.get("files") or []
    return files[0]["id"] if files else None


def _item_folder_name(item: dict) -> str:
    date_part = (item.get("created_at") or "")[:10] or "undated"
    return f"{date_part}_#{item['id']}_{_slug(item.get('topic') or item.get('source_key') or 'item')}"


def format_text_summary(item: dict) -> str:
    """Render a clean, human-readable post or video script summary for Drive backup."""
    kind = item.get("kind") or "unknown"
    draft = item.get("draft") if isinstance(item.get("draft"), dict) else {}
    media = item.get("media") if isinstance(item.get("media"), dict) else {}
    lines = [
        f"PyMasters Generated {kind.upper()} (#{item.get('id')})",
        f"Topic: {item.get('topic', '')}",
        f"Status: {item.get('status', '')}",
        f"Source Key: {item.get('source_key', '')}",
        f"Score: {item.get('score', '')}",
        f"Created At: {item.get('created_at', '')}",
        f"Publish At: {item.get('publish_at', '')}",
        f"Remote URL: {item.get('remote_url', '')}",
        f"Lesson URL: {media.get('lesson_url', '')}",
    ]
    if media.get("space_url"):
        lines.append(f"Hugging Face Space: {media['space_url']}")
    lines.append("")

    if kind in ("linkedin", "thematic"):
        lines.append("=== LINKEDIN POST ===")
        lines.append((draft.get("post") or "").strip())
        if draft.get("hashtags"):
            lines.append("")
            lines.append("Hashtags: " + " ".join(draft["hashtags"]))
        if draft.get("code_snippet"):
            lines.append("")
            lines.append("=== RUNNABLE PYTHON CODE ===")
            lines.append(draft["code_snippet"].strip())
        anim = draft.get("animation") or {}
        if anim:
            lines.append("")
            lines.append(f"=== ANIMATION: {anim.get('title', '')} ===")
            for i, b in enumerate(anim.get("beats") or [], 1):
                lines.append(f"{i}. [{b.get('kind', '')}] {b.get('caption', '')}")
    else:
        lines.append(f"=== TITLE ===\n{draft.get('title', item.get('topic', ''))}\n")
        lines.append(f"=== HOOK ===\n{draft.get('hook', '')}\n")
        if kind == "short":
            lines.append("=== SCENES ===")
            for i, sc in enumerate(draft.get("scenes") or [], 1):
                vis = sc.get("visual") or {}
                lines.append(
                    f"Scene {i} [{vis.get('type', '')}] {vis.get('step_badge', '')} — {vis.get('heading', '')}"
                )
                if vis.get("note"):
                    lines.append(f"  Visual Note: {vis['note']}")
                lines.append(f"  Narration: {sc.get('narration', '')}")
                if vis.get("code"):
                    lines.append("  Code:\n    " + "\n    ".join(vis["code"].splitlines()))
        else:
            lines.append("=== CHAPTERS ===")
            for ci, ch in enumerate(draft.get("chapters") or [], 1):
                lines.append(f"\nChapter {ci}: {ch.get('title', '')}")
                for si, sc in enumerate(ch.get("scenes") or [], 1):
                    vis = sc.get("visual") or {}
                    lines.append(
                        f"  Scene {si} [{vis.get('type', '')}] {vis.get('step_badge', '')} — {vis.get('heading', '')}"
                    )
                    if vis.get("note"):
                        lines.append(f"    Visual Note: {vis['note']}")
                    lines.append(f"    Narration: {sc.get('narration', '')}")
        lines.append(f"\n=== CTA ===\n{draft.get('cta', '')}\n")
        try:
            from socialbot.publish import youtube as yt
            full_desc = yt.build_description(draft, media, kind)
        except Exception:
            full_desc = draft.get("description") or ""
        lines.append(f"=== DESCRIPTION ===\n{full_desc}\n")
        if draft.get("tags"):
            lines.append("Tags: " + ", ".join(draft["tags"]))
    return "\n".join(lines).strip() + "\n"


def _collect_item_payloads(item: dict) -> tuple[list[tuple[str, str, bytes]], list[tuple[str, str, Path]]]:
    """Return (in_memory_files, disk_files) for one socialbot item."""
    kind = item.get("kind") or "linkedin"
    text_name = "post.txt" if kind in ("linkedin", "thematic") else "script.txt"
    mem_files = [
        (text_name, "text/plain", format_text_summary(item).encode("utf-8")),
        ("metadata.json", "application/json", json.dumps(item, indent=2, ensure_ascii=False).encode("utf-8")),
    ]
    media = item.get("media") if isinstance(item.get("media"), dict) else {}
    seen_paths: set[Path] = set()
    disk_files: list[tuple[str, str, Path]] = []
    for key in ("gif", "video", "thumbnail", "srt"):
        raw = media.get(key)
        if not raw:
            continue
        p = Path(raw)
        if p.is_file() and p not in seen_paths:
            seen_paths.add(p)
            mime = MIME_TYPES.get(p.suffix.lower(), "application/octet-stream")
            disk_files.append((p.name, mime, p))
    return mem_files, disk_files


def _upsert_media(svc, name: str, parent_id: str, mime: str, media_body, known_id: str | None, app_props: dict) -> str:
    file_id = known_id or _find_file(svc, name, parent_id)
    if file_id:
        try:
            updated = svc.files().update(fileId=file_id, media_body=media_body, fields="id").execute()
            return updated["id"]
        except Exception as e:
            if "404" not in str(e):
                raise
    body = {
        "name": name,
        "parents": [parent_id],
        "appProperties": {k: str(v) for k, v in app_props.items()},
    }
    created = svc.files().create(body=body, media_body=media_body, fields="id").execute()
    return created["id"]


def sync_item(item: dict, svc=None, manifest: dict | None = None, force: bool = False) -> dict:
    """Sync one rendered/scheduled/published item to Google Drive idempotently."""
    from googleapiclient.http import MediaFileUpload, MediaInMemoryUpload

    svc = svc or client()
    _verify_account(svc)
    own_manifest = manifest is None
    if manifest is None:
        manifest = _load_manifest()
    folders = _ensure_category_folders(svc, manifest)

    category = CATEGORY_FOLDERS.get(item.get("kind"), "Posts")
    parent_cat_id = folders[category]
    item_key = str(item["id"])
    item_rec = manifest.setdefault("items", {}).setdefault(item_key, {"files": {}})

    folder_id = item_rec.get("folder_id")
    if not folder_id:
        folder_id = _ensure_folder(
            svc,
            _item_folder_name(item),
            parent_id=parent_cat_id,
            app_props={"pymasters_item_id": item_key, "pymasters_kind": item.get("kind", "")},
        )
        item_rec["folder_id"] = folder_id

    files_state = item_rec.setdefault("files", {})
    mem_files, disk_files = _collect_item_payloads(item)
    stats = {"uploaded": 0, "updated": 0, "skipped": 0, "folder_id": folder_id}

    for fname, mime, raw_bytes in mem_files:
        digest = _sha256_bytes(raw_bytes)
        prev = files_state.get(fname) or {}
        if not force and prev.get("sha256") == digest and prev.get("id"):
            stats["skipped"] += 1
            continue
        fid = _upsert_media(
            svc,
            fname,
            folder_id,
            mime,
            MediaInMemoryUpload(raw_bytes, mimetype=mime, resumable=False),
            prev.get("id"),
            {"pymasters_item_id": item_key, "pymasters_role": fname},
        )
        stats["updated" if prev.get("id") else "uploaded"] += 1
        files_state[fname] = {"id": fid, "sha256": digest}

    for fname, mime, path in disk_files:
        digest = _sha256_file(path)
        prev = files_state.get(fname) or {}
        if not force and prev.get("sha256") == digest and prev.get("id"):
            stats["skipped"] += 1
            continue
        fid = _upsert_media(
            svc,
            fname,
            folder_id,
            mime,
            MediaFileUpload(str(path), mimetype=mime, chunksize=8 * 1024 * 1024, resumable=True),
            prev.get("id"),
            {"pymasters_item_id": item_key, "pymasters_role": fname},
        )
        stats["updated" if prev.get("id") else "uploaded"] += 1
        files_state[fname] = {"id": fid, "sha256": digest}

    item_rec["drive_url"] = f"https://drive.google.com/drive/folders/{folder_id}"
    if own_manifest:
        _save_manifest(manifest)
    return stats


def sync_all(statuses=("rendered", "scheduled", "published"), limit: int = 500, force: bool = False) -> dict:
    """Sync all generated posts, shorts, and videos matching `statuses` to Google Drive."""
    svc = client()
    email = _verify_account(svc)
    manifest = _load_manifest()
    folders = _ensure_category_folders(svc, manifest)

    items_to_sync = []
    seen_ids = set()
    for st in statuses:
        for it in store.items(status=st, limit=limit):
            if it["id"] not in seen_ids:
                seen_ids.add(it["id"])
                items_to_sync.append(it)
    items_to_sync.sort(key=lambda x: x["id"])

    summary = {
        "account": email or config.GOOGLE_DRIVE_EMAIL,
        "root_folder": config.DRIVE_ROOT_FOLDER,
        "root_url": f"https://drive.google.com/drive/folders/{folders['root']}",
        "items": 0,
        "uploaded": 0,
        "updated": 0,
        "skipped": 0,
    }
    for it in items_to_sync:
        res = sync_item(it, svc=svc, manifest=manifest, force=force)
        _save_manifest(manifest)
        summary["items"] += 1
        summary["uploaded"] += res["uploaded"]
        summary["updated"] += res["updated"]
        summary["skipped"] += res["skipped"]
    return summary
