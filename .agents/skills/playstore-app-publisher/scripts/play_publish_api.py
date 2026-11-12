#!/usr/bin/env python3
"""
Generalized Google Play Android Publisher API v3 CLI for the playstore-app-publisher skill.
Supports service account JSON keys OR keyless GCP service account impersonation (--impersonate),
multi-locale Fastlane metadata + graphics uploads, store contact details sync, and idempotent versionCode reuse.
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


def get_credentials(creds_path: str | None, impersonate_sa: str | None):
    env_json = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON", "").strip()
    if creds_path:
        return service_account.Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    if env_json:
        if Path(env_json).is_file():
            return service_account.Credentials.from_service_account_file(env_json, scopes=SCOPES)
        return service_account.Credentials.from_service_account_info(json.loads(env_json), scopes=SCOPES)
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
        gcloud_bin = shutil.which("gcloud") or str(Path.home() / ".local/opt/google-cloud-sdk/bin/gcloud")
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
    parser = argparse.ArgumentParser(description="Publish signed .aab + Fastlane metadata to Google Play Store")
    parser.add_argument("--package", required=True, help="Android applicationId (e.g. net.pymasters.app)")
    parser.add_argument("--aab", required=True, help="Path to signed release .aab")
    parser.add_argument("--track", default="internal", choices=["internal", "alpha", "beta", "production"])
    parser.add_argument("--status", default="completed", choices=["completed", "draft", "inProgress", "halted"])
    parser.add_argument("--credentials", default=None, help="Optional service account JSON path")
    parser.add_argument("--impersonate", default=None, help="Service account email for keyless impersonation")
    parser.add_argument("--metadata-dir", default="", help="Fastlane locale directory (title.txt, images/, changelogs/)")
    parser.add_argument("--languages", default="en-GB,en-US", help="Comma-separated store listing locales")
    parser.add_argument("--contact-email", default="", help="Public developer support email")
    parser.add_argument("--contact-website", default="", help="Public developer website URL")
    args = parser.parse_args()

    aab_path = Path(args.aab).resolve()
    if not aab_path.is_file():
        print(f"ERROR: Signed AAB not found at {aab_path}", file=sys.stderr)
        return 1

    locales = [loc.strip() for loc in args.languages.split(",") if loc.strip()]
    creds = get_credentials(args.credentials, args.impersonate)
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = service.edits()

    print(f"1. Opening Play Store edit session for {args.package}...")
    edit_id = edits.insert(body={}, packageName=args.package).execute()["id"]

    if args.contact_email or args.contact_website:
        details_body = {"defaultLanguage": locales[0] if locales else "en-GB"}
        if args.contact_email:
            details_body["contactEmail"] = args.contact_email
        if args.contact_website:
            details_body["contactWebsite"] = args.contact_website
        edits.details().update(packageName=args.package, editId=edit_id, body=details_body).execute()

    meta_dir = Path(args.metadata_dir) if args.metadata_dir else None
    if meta_dir and meta_dir.is_dir():
        title = (meta_dir / "title.txt").read_text(encoding="utf-8").strip()[:30]
        short_desc = (meta_dir / "short_description.txt").read_text(encoding="utf-8").strip()[:80]
        full_desc = (meta_dir / "full_description.txt").read_text(encoding="utf-8").strip()[:4000]
        images_dir = meta_dir / "images"
        for lang in locales:
            print(f"2. Syncing {lang} store listing & graphics...")
            edits.listings().update(
                packageName=args.package,
                editId=edit_id,
                language=lang,
                body={"language": lang, "title": title, "shortDescription": short_desc, "fullDescription": full_desc},
            ).execute()
            if images_dir.is_dir():
                icon_file = images_dir / "icon.png"
                if icon_file.is_file():
                    edits.images().upload(
                        packageName=args.package,
                        editId=edit_id,
                        language=lang,
                        imageType="icon",
                        media_body=MediaFileUpload(str(icon_file), mimetype="image/png"),
                    ).execute()
                fg_file = images_dir / "featureGraphic.png"
                if fg_file.is_file():
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
                            edits.images().upload(
                                packageName=args.package,
                                editId=edit_id,
                                language=lang,
                                imageType="phoneScreenshots",
                                media_body=MediaFileUpload(str(shot), mimetype="image/png"),
                            ).execute()

    print(f"3. Uploading bundle {aab_path.name} ({aab_path.stat().st_size / 1024:.1f} KB)...")
    try:
        res = edits.bundles().upload(
            packageName=args.package,
            editId=edit_id,
            media_body=MediaFileUpload(str(aab_path), mimetype="application/octet-stream", resumable=True),
        ).execute()
        version_code = res["versionCode"]
        print(f"   Uploaded versionCode={version_code}")
    except HttpError as err:
        if "already been used" in err.content.decode("utf-8", errors="replace"):
            existing = edits.bundles().list(packageName=args.package, editId=edit_id).execute().get("bundles", [])
            if not existing:
                raise
            version_code = max(b["versionCode"] for b in existing)
            print(f"   Reusing already-uploaded versionCode={version_code}")
        else:
            raise

    release_notes = []
    if meta_dir:
        changelog = meta_dir / "changelogs" / f"{version_code}.txt"
        if changelog.is_file():
            note = changelog.read_text(encoding="utf-8").strip()[:500]
            release_notes = [{"language": lang, "text": note} for lang in locales]

    print(f"4. Assigning versionCode={version_code} to track={args.track} (status={args.status})...")
    edits.tracks().update(
        packageName=args.package,
        editId=edit_id,
        track=args.track,
        body={
            "track": args.track,
            "releases": [{"versionCodes": [str(version_code)], "status": args.status, "releaseNotes": release_notes}],
        },
    ).execute()

    committed = edits.commit(packageName=args.package, editId=edit_id).execute()
    print(f"SUCCESS: Committed editId={committed['id']} for {args.package} (versionCode={version_code}, track={args.track})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
