#!/usr/bin/env python3
"""
Direct Target-WebSocket CDP helper for Eighty Browser (/usr/local/bin/eighty on port 9222).
Avoids Playwright connect_over_cdp timeouts on Chromium 156+ browser_ui targets.
"""
import argparse
import asyncio
import base64
import json
import pathlib
import urllib.request
import websockets

CDP_BASE = "http://127.0.0.1:9222"


def list_targets(cdp_base: str = CDP_BASE) -> list[dict]:
    with urllib.request.urlopen(f"{cdp_base}/json/list", timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def find_page_target(url_substr: str, cdp_base: str = CDP_BASE) -> dict:
    pages = [t for t in list_targets(cdp_base) if t.get("type") == "page" and url_substr in t.get("url", "")]
    if not pages:
        raise RuntimeError(f"No open Eighty Browser page target matching {url_substr!r}")
    # Prefer AI Studio tab with showPreview=true when multiple tabs match
    for p in pages:
        if "showPreview=true" in p.get("url", ""):
            return p
    return pages[0]


async def cdp_call(ws, counter: list[int], method: str, params: dict | None = None) -> dict:
    counter[0] += 1
    msg_id = counter[0]
    await ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
    while True:
        raw = json.loads(await ws.recv())
        if raw.get("id") == msg_id:
            if "error" in raw:
                raise RuntimeError(f"CDP {method} failed: {raw['error']}")
            return raw.get("result", {})


async def eval_js(ws, counter: list[int], expression: str):
    res = await cdp_call(
        ws,
        counter,
        "Runtime.evaluate",
        {"expression": expression, "returnByValue": True, "awaitPromise": True},
    )
    return res.get("result", {}).get("value")


async def cmd_eval(url_substr: str, expr: str) -> None:
    target = find_page_target(url_substr)
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
        c = [0]
        val = await eval_js(ws, c, expr)
        print(json.dumps(val, indent=2) if isinstance(val, (dict, list)) else val)


async def cmd_screenshot(url_substr: str, out_path: str, width: int, height: int) -> None:
    target = find_page_target(url_substr)
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
        c = [0]
        await cdp_call(ws, c, "Page.bringToFront")
        await cdp_call(
            ws,
            c,
            "Emulation.setDeviceMetricsOverride",
            {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False},
        )
        await asyncio.sleep(0.5)
        shot = await cdp_call(ws, c, "Page.captureScreenshot", {"format": "png"})
        await cdp_call(ws, c, "Emulation.clearDeviceMetricsOverride")
        dest = pathlib.Path(out_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(base64.b64decode(shot["data"]))
        print(f"Saved screenshot: {dest} ({dest.stat().st_size:,} bytes)")


async def cmd_mobile_screenshots(out_dir: str, specs: list[str], wait_sec: float) -> None:
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(f"{CDP_BASE}/json/new?about:blank", method="PUT")
    tab = json.loads(urllib.request.urlopen(req, timeout=5).read().decode("utf-8"))
    tab_id = tab["id"]
    try:
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
            c = [0]
            await cdp_call(ws, c, "Page.enable")
            await cdp_call(ws, c, "Page.bringToFront")
            await cdp_call(
                ws,
                c,
                "Emulation.setDeviceMetricsOverride",
                {"width": 360, "height": 800, "deviceScaleFactor": 3, "mobile": True},
            )
            for item in specs:
                name, url = item.split("=", 1)
                await cdp_call(ws, c, "Page.navigate", {"url": url})
                for _ in range(25):
                    await asyncio.sleep(0.4)
                    if await eval_js(ws, c, "document.readyState") == "complete":
                        break
                await asyncio.sleep(wait_sec)
                shot = await cdp_call(
                    ws,
                    c,
                    "Page.captureScreenshot",
                    {"format": "png", "clip": {"x": 0, "y": 0, "width": 360, "height": 800, "scale": 1}},
                )
                dest = out / name
                dest.write_bytes(base64.b64decode(shot["data"]))
                print(f"Saved 1080x2400 screenshot: {dest} ({dest.stat().st_size:,} bytes)")
    finally:
        urllib.request.urlopen(f"{CDP_BASE}/json/close/{tab_id}", timeout=5).read()


def main() -> None:
    parser = argparse.ArgumentParser(description="Eighty Browser Direct-WebSocket CDP Utility")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-tabs", help="List open page targets in Eighty Browser")

    p_eval = sub.add_parser("eval", help="Evaluate JS in matching tab")
    p_eval.add_argument("--match", required=True, help="URL substring to match")
    p_eval.add_argument("--js", required=True, help="JavaScript expression")

    p_shot = sub.add_parser("screenshot", help="Capture desktop screenshot of matching tab")
    p_shot.add_argument("--match", required=True, help="URL substring to match")
    p_shot.add_argument("--out", required=True, help="Output PNG path")
    p_shot.add_argument("--width", type=int, default=1440)
    p_shot.add_argument("--height", type=int, default=900)

    p_mob = sub.add_parser("mobile-screenshots", help="Capture 1080x2400 mobile screenshots in isolated tab")
    p_mob.add_argument("--out-dir", required=True, help="Directory to write PNGs")
    p_mob.add_argument("--wait", type=float, default=2.5, help="Post-load settle delay in seconds")
    p_mob.add_argument("specs", nargs="+", help="Pairs of filename.png=https://url")

    args = parser.parse_args()
    if args.cmd == "list-tabs":
        for t in list_targets():
            if t.get("type") == "page":
                print(f"{t['id']}  {t.get('title', '')[:45]:45s}  {t.get('url', '')}")
    elif args.cmd == "eval":
        asyncio.run(cmd_eval(args.match, args.js))
    elif args.cmd == "screenshot":
        asyncio.run(cmd_screenshot(args.match, args.out, args.width, args.height))
    elif args.cmd == "mobile-screenshots":
        asyncio.run(cmd_mobile_screenshots(args.out_dir, args.specs, args.wait))


if __name__ == "__main__":
    main()
