#!/usr/bin/env python3
"""
Capture Play Store-ready portrait phone screenshots via Eighty Browser CDP (port 9222).
Uses an isolated temporary tab (`PUT /json/new?about:blank`) and closes it cleanly on exit,
leaving existing developer tabs (Play Console, AI Studio) undisturbed.

Usage:
  python3 capture_playstore_screenshots.py \
    --out-dir ./screenshots \
    --fastlane-dir android/fastlane/metadata/android/en-US/images/phoneScreenshots \
    --url 01-home.png=https://example.com/ \
    --url 02-pricing.png=https://example.com/pricing
"""
import argparse
import asyncio
import base64
import json
import pathlib
import shutil
import struct
import urllib.request
import websockets


async def cdp_call(ws, counter, method, params=None):
    counter[0] += 1
    cur = counter[0]
    await ws.send(json.dumps({"id": cur, "method": method, "params": params or {}}))
    while True:
        raw = json.loads(await ws.recv())
        if raw.get("id") == cur:
            if "error" in raw:
                raise RuntimeError(f"CDP {method} failed: {raw['error']}")
            return raw.get("result", {})


def png_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Captured payload is not a valid PNG")
    return struct.unpack(">II", data[16:24])


async def capture_all(args: argparse.Namespace) -> None:
    out_dir = pathlib.Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    fastlane_dir = pathlib.Path(args.fastlane_dir).resolve() if args.fastlane_dir else None
    if fastlane_dir:
        fastlane_dir.mkdir(parents=True, exist_ok=True)

    pairs: list[tuple[str, str]] = []
    for item in args.url:
        if "=" not in item:
            raise SystemExit(f"Invalid --url '{item}': expected filename.png=https://...")
        fname, url = item.split("=", 1)
        pairs.append((fname.strip(), url.strip()))

    req = urllib.request.Request(f"http://127.0.0.1:{args.cdp_port}/json/new?about:blank", method="PUT")
    tab = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    tab_id = tab["id"]

    try:
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
            c = [0]
            await cdp_call(ws, c, "Page.enable")
            await cdp_call(ws, c, "Emulation.setDeviceMetricsOverride", {
                "width": args.width,
                "height": args.height,
                "deviceScaleFactor": args.scale,
                "mobile": True,
            })
            if args.user_agent:
                await cdp_call(ws, c, "Emulation.setUserAgentOverride", {"userAgent": args.user_agent})

            for fname, url in pairs:
                print(f"Capturing {fname} <- {url} ...")
                await cdp_call(ws, c, "Page.navigate", {"url": url})
                for _ in range(30):
                    await asyncio.sleep(0.5)
                    res = await cdp_call(ws, c, "Runtime.evaluate", {
                        "expression": "document.readyState",
                        "returnByValue": True,
                    })
                    if res.get("result", {}).get("value") == "complete":
                        break
                await asyncio.sleep(args.settle_seconds)

                shot = await cdp_call(ws, c, "Page.captureScreenshot", {
                    "format": "png",
                    "clip": {"x": 0, "y": 0, "width": args.width, "height": args.height, "scale": 1},
                })
                raw_png = base64.b64decode(shot["data"])
                px_w, px_h = png_dimensions(raw_png)
                dest = out_dir / fname
                dest.write_bytes(raw_png)
                if fastlane_dir:
                    shutil.copy2(dest, fastlane_dir / fname)
                print(f"  Saved {dest} ({px_w}x{px_h}, {len(raw_png):,} bytes)")
    finally:
        urllib.request.urlopen(f"http://127.0.0.1:{args.cdp_port}/json/close/{tab_id}", timeout=5).read()


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture 1080x2400 Play Store screenshots via Eighty CDP")
    parser.add_argument("--out-dir", required=True, help="Output directory for PNG screenshots")
    parser.add_argument("--fastlane-dir", default="", help="Optional Fastlane phoneScreenshots directory to mirror into")
    parser.add_argument("--url", action="append", required=True, help="Mapping filename.png=https://url (repeatable)")
    parser.add_argument("--width", type=int, default=360, help="Logical viewport width (default: 360)")
    parser.add_argument("--height", type=int, default=800, help="Logical viewport height (default: 800)")
    parser.add_argument("--scale", type=int, default=3, help="Device scale factor (default: 3 -> 1080x2400)")
    parser.add_argument("--settle-seconds", type=float, default=2.5, help="Post-load settle delay in seconds")
    parser.add_argument("--cdp-port", type=int, default=9222, help="Eighty CDP port (default: 9222)")
    parser.add_argument(
        "--user-agent",
        default="Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
        help="Override User-Agent string",
    )
    args = parser.parse_args()
    asyncio.run(capture_all(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
