#!/usr/bin/env python3
"""
Upload a production-signed PyMasters Android App Bundle (.aab) and store listing
metadata directly to Google Play Console via the Google Play Android Publisher API v3.

Usage:
  # Using service account JSON key (e.g. PLAY_SERVICE_ACCOUNT_JSON env or --credentials):
  uv run --with google-api-python-client --with google-auth scripts/publish_play_store.py \
    --aab android/app/build/outputs/bundle/release/app-release.aab \
    --track production

  # Or using keyless Service Account Impersonation via gcloud ADC:
  uv run --with google-api-python-client --with google-auth scripts/publish_play_store.py \
    --aab android/app/build/outputs/bundle/release/app-release.aab \
    --impersonate play-publisher@pymasters-app.iam.gserviceaccount.com \
    --track internal
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import google.auth
from google.auth import exceptions as auth_exceptions
from google.auth import impersonated_credentials
from google.oauth2 import credentials as oauth2_credentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]
DEFAULT_PACKAGE = "net.pymasters.app"


def get_credentials(creds_path: str | None, impersonate_sa: str | None):
    env_json = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON", "").strip()
    if creds_path:
        return service_account.Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    if env_json:
        if Path(env_json).is_file():
            return service_account.Credentials.from_service_account_file(env_json, scopes=SCOPES)
        info = json.loads(env_json)
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    try:
        source_creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        if impersonate_sa:
            return impersonated_credentials.Credentials(
                source_credentials=source_creds,
                target_principal=impersonate_sa,
                target_scopes=SCOPES,
                lifetime=3600,
            )
        return source_creds
    except auth_exceptions.DefaultCredentialsError:
        gcloud_bin = shutil.which("gcloud") or str(
            Path.home() / ".local/opt/google-cloud-sdk/bin/gcloud"
        )
        if impersonate_sa and Path(gcloud_bin).is_file():
            token = subprocess.check_output(
                [
                    gcloud_bin,
                    "auth",
                    "print-access-token",
                    f"--impersonate-service-account={impersonate_sa}",
                    f"--scopes={','.join(SCOPES)}",
                ],
                text=True,
            ).strip()
            return oauth2_credentials.Credentials(token=token)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish PyMasters .aab to Google Play Store")
    parser.add_argument("--package", default=DEFAULT_PACKAGE, help="Android applicationId")
    parser.add_argument(
        "--aab",
        default="android/app/build/outputs/bundle/release/app-release.aab",
        help="Path to signed release .aab",
    )
    parser.add_argument(
        "--track",
        default="internal",
        choices=["internal", "alpha", "beta", "production"],
        help="Google Play release track",
    )
    parser.add_argument(
        "--status",
        default="completed",
        choices=["completed", "draft"],
        help="Release status ('draft' for newly created apps not yet reviewed, 'completed' for live tracks)",
    )
    parser.add_argument("--credentials", default=None, help="Path to service account JSON")
    parser.add_argument(
        "--impersonate",
        default="play-publisher@pymasters-app.iam.gserviceaccount.com",
        help="Service account email to impersonate when no JSON key is provided",
    )
    parser.add_argument(
        "--metadata-dir",
        default="android/fastlane/metadata/android/en-US",
        help="Fastlane en-US metadata folder",
    )
    parser.add_argument(
        "--languages",
        default="en-GB,en-US",
        help="Comma-separated Play Store listing locales to populate (e.g. en-GB,en-US)",
    )
    args = parser.parse_args()
    locales = [loc.strip() for loc in args.languages.split(",") if loc.strip()]

    aab_path = Path(args.aab).resolve()
    if not aab_path.is_file():
        print(f"ERROR: Signed AAB not found at {aab_path}", file=sys.stderr)
        return 1

    creds = get_credentials(args.credentials, args.impersonate)
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = service.edits()

    try:
        print(f"1. Creating Play Store edit session for {args.package}...")
        edit = edits.insert(body={}, packageName=args.package).execute()
        edit_id = edit["id"]

        edits.details().update(
            packageName=args.package,
            editId=edit_id,
            body={
                "defaultLanguage": locales[0] if locales else "en-GB",
                "contactEmail": "muthu@pymasters.net",
                "contactWebsite": "https://pymasters.net",
            },
        ).execute()

        meta_dir = Path(args.metadata_dir)
        if meta_dir.is_dir():
            title = (meta_dir / "title.txt").read_text(encoding="utf-8").strip()[:30]
            short_desc = (meta_dir / "short_description.txt").read_text(encoding="utf-8").strip()[:80]
            full_desc = (meta_dir / "full_description.txt").read_text(encoding="utf-8").strip()[:4000]
            images_dir = meta_dir / "images"
            for lang in locales:
                print(f"2. Updating {lang} store listing metadata & graphics...")
                edits.listings().update(
                    packageName=args.package,
                    editId=edit_id,
                    language=lang,
                    body={
                        "language": lang,
                        "title": title,
                        "shortDescription": short_desc,
                        "fullDescription": full_desc,
                    },
                ).execute()

                if images_dir.is_dir():
                    icon_file = images_dir / "icon.png"
                    if icon_file.is_file():
                        print(f"   [{lang}] Uploading 512x512 icon...")
                        edits.images().upload(
                            packageName=args.package,
                            editId=edit_id,
                            language=lang,
                            imageType="icon",
                            media_body=MediaFileUpload(str(icon_file), mimetype="image/png"),
                        ).execute()
                    fg_file = images_dir / "featureGraphic.png"
                    if fg_file.is_file():
                        print(f"   [{lang}] Uploading 1024x500 featureGraphic...")
                        edits.images().upload(
                            packageName=args.package,
                            editId=edit_id,
                            language=lang,
                            imageType="featureGraphic",
                            media_body=MediaFileUpload(str(fg_file), mimetype="image/png"),
                        ).execute()
                    shots_dir = images_dir / "phoneScreenshots"
                    if shots_dir.is_dir():
                        shots = sorted(shots_dir.glob("*.png"))[:8]
                        if shots:
                            edits.images().deleteall(
                                packageName=args.package,
                                editId=edit_id,
                                language=lang,
                                imageType="phoneScreenshots",
                            ).execute()
                            for shot in shots:
                                print(f"   [{lang}] Uploading phone screenshot {shot.name}...")
                                edits.images().upload(
                                    packageName=args.package,
                                    editId=edit_id,
                                    language=lang,
                                    imageType="phoneScreenshots",
                                    media_body=MediaFileUpload(str(shot), mimetype="image/png"),
                                ).execute()

        print(f"3. Uploading {aab_path.name} ({aab_path.stat().st_size / 1024:.1f} KB)...")
        try:
            media = MediaFileUpload(str(aab_path), mimetype="application/octet-stream", resumable=True)
            bundle_res = edits.bundles().upload(
                packageName=args.package,
                editId=edit_id,
                media_body=media,
            ).execute()
            version_code = bundle_res["versionCode"]
            print(f"   Uploaded bundle versionCode={version_code}")
        except HttpError as upload_err:
            err_body = upload_err.content.decode("utf-8", errors="replace")
            if "already been used" in err_body:
                existing = edits.bundles().list(packageName=args.package, editId=edit_id).execute().get("bundles", [])
                if not existing:
                    raise
                version_code = max(b["versionCode"] for b in existing)
                print(f"   Bundle versionCode={version_code} already uploaded; reusing existing bundle.")
            else:
                raise

        changelog_file = meta_dir / "changelogs" / f"{version_code}.txt"
        release_notes = []
        if changelog_file.is_file():
            note_text = changelog_file.read_text(encoding="utf-8").strip()[:500]
            release_notes = [{"language": lang, "text": note_text} for lang in locales]

        print(f"4. Assigning versionCode={version_code} to '{args.track}' track (status={args.status})...")
        edits.tracks().update(
            packageName=args.package,
            editId=edit_id,
            track=args.track,
            body={
                "track": args.track,
                "releases": [
                    {
                        "versionCodes": [str(version_code)],
                        "status": args.status,
                        "releaseNotes": release_notes,
                    }
                ],
            },
        ).execute()

        print("5. Committing Play Store edit...")
        commit_res = edits.commit(packageName=args.package, editId=edit_id).execute()
        print(f"✅ Successfully published {args.package} (versionCode {version_code}) to '{args.track}'! Edit ID: {commit_res.get('id')}")
        return 0

    except HttpError as err:
        print(f"\n⚠️ Google Play Developer API returned HTTP {err.resp.status}:", file=sys.stderr)
        print(err.content.decode("utf-8", errors="replace"), file=sys.stderr)
        if err.resp.status in (401, 403, 404):
            print(
                "\n--- One-Time Google Play Console Link Needed ---\n"
                "Google Play requires creating the app shell once in Play Console UI and inviting the Publisher Service Account:\n"
                "  1. Open https://play.google.com/console -> 'Create app' -> Name: 'PyMasters: Learn Python & AI'\n"
                "  2. Upload the initial signed AAB from ~/Downloads/PyMasters-PlayStore-Pack/PyMasters-v1.0.0-release.aab (so Play locks package name net.pymasters.app)\n"
                "  3. In Play Console -> 'Users and permissions' -> 'Invite new users', add:\n"
                "       play-publisher@pymasters-app.iam.gserviceaccount.com\n"
                "     with 'Release to production, exclude devices, and use Play App Signing' + 'Manage store presence' permissions.\n"
                "  After that one-time link, both this script and GitHub Actions deploy every release 100% automatically!",
                file=sys.stderr,
            )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
