#!/usr/bin/env python3
"""
Automates Google AI Studio's 3-step Publish Wizard (Cloud Run + free .ai.studio domain),
switches Share -> General access to Public, fixes Cloud Run 403 invoker checks when needed,
and verifies live HTTP 200 responses.
"""
import argparse
import asyncio
import json
import shutil
import subprocess
import time
import urllib.request
import websockets

from eighty_cdp import cdp_call, eval_js, find_page_target


async def publish_in_aistudio(app_id: str, project_id: str, slug: str, description: str) -> None:
    target = find_page_target(app_id)
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
        c = [0]
        await cdp_call(ws, c, "Page.bringToFront")

        # Open Publish panel if not already open
        await eval_js(
            ws,
            c,
            """(() => {
                if (!document.querySelector("ms-settings-publish-panel")) {
                    Array.from(document.querySelectorAll("button")).find(b => (b.innerText || "").trim() === "Publish")?.click();
                }
            })()""",
        )
        for _ in range(25):
            await asyncio.sleep(1.0)
            txt = await eval_js(ws, c, """document.querySelector("mat-dialog-container")?.innerText || "" """)
            if txt and "Loading publication state" not in txt:
                break

        # If already published, click Republish directly
        if "Republish" in (txt or ""):
            print("App is already published — triggering Republish...")
            await eval_js(
                ws,
                c,
                """Array.from(document.querySelectorAll("mat-dialog-container button")).find(b => (b.innerText || "").includes("Republish"))?.click()""",
            )
        else:
            # Click 'Get started' if shown
            await eval_js(
                ws,
                c,
                """Array.from(document.querySelectorAll("mat-dialog-container button")).find(b => (b.innerText || "").includes("Get started"))?.click()""",
            )
            await asyncio.sleep(1.5)

            # Step 1: Select or Import GCP Project
            await eval_js(ws, c, """document.querySelector("mat-dialog-container mat-select")?.click()""")
            await asyncio.sleep(1.0)
            found_proj = await eval_js(
                ws,
                c,
                f"""(() => {{
                    const opts = Array.from(document.querySelectorAll("mat-option, [role=option]"));
                    const match = opts.find(o => (o.innerText || "").toLowerCase().includes({json.dumps(project_id.lower())}));
                    if (match) {{ match.click(); return "SELECTED"; }}
                    const imp = opts.find(o => /Import project/i.test(o.innerText || ""));
                    if (imp) {{ imp.click(); return "IMPORT_NEEDED"; }}
                    return "NOT_FOUND";
                }})()""",
            )
            if found_proj == "IMPORT_NEEDED":
                await asyncio.sleep(2.5)
                await eval_js(
                    ws,
                    c,
                    f"""(() => {{
                        const row = Array.from(document.querySelectorAll("mat-checkbox, [role=checkbox], tr, mat-list-option"))
                            .find(el => (el.innerText || "").toLowerCase().includes({json.dumps(project_id.lower())}));
                        if (row) (row.querySelector("input") || row).click();
                    }})()""",
                )
                await asyncio.sleep(0.8)
                await eval_js(
                    ws,
                    c,
                    """Array.from(document.querySelectorAll("button")).find(b => (b.innerText || "").trim() === "Import" && !b.disabled)?.click()""",
                )
                await asyncio.sleep(3.0)
                await eval_js(ws, c, """document.querySelector("mat-dialog-container mat-select")?.click()""")
                await asyncio.sleep(1.0)
                await eval_js(
                    ws,
                    c,
                    f"""Array.from(document.querySelectorAll("mat-option, [role=option]")).find(o => (o.innerText || "").toLowerCase().includes({json.dumps(project_id.lower())}))?.click()""",
                )

            await asyncio.sleep(2.0)
            await eval_js(
                ws,
                c,
                """Array.from(document.querySelectorAll("mat-dialog-container button")).find(b => (b.innerText || "").trim() === "Continue" && !b.disabled)?.click()""",
            )

            # Step 2: Vanity .ai.studio URL
            for _ in range(15):
                await asyncio.sleep(1.0)
                s2 = await eval_js(ws, c, """document.querySelector("ms-settings-publish-panel")?.innerText || "" """)
                if "Domain and URL" in s2:
                    break
            await eval_js(
                ws,
                c,
                f"""(() => {{
                    const inp = document.querySelector("ms-settings-publish-panel input");
                    if (!inp) return;
                    inp.focus();
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    setter.call(inp, {json.dumps(slug)});
                    inp.dispatchEvent(new Event("input", {{ bubbles: true }}));
                    inp.dispatchEvent(new Event("change", {{ bubbles: true }}));
                }})()""",
            )
            await asyncio.sleep(2.5)
            await eval_js(
                ws,
                c,
                """Array.from(document.querySelectorAll("ms-settings-publish-panel button")).find(b => /Continue with free URL|Continue/i.test(b.innerText || "") && !b.disabled)?.click()""",
            )

            # Step 3: Final touches & Publish
            for _ in range(15):
                await asyncio.sleep(1.0)
                s3 = await eval_js(ws, c, """document.querySelector("ms-settings-publish-panel")?.innerText || "" """)
                if "Step 3" in s3:
                    break
            if description:
                await eval_js(
                    ws,
                    c,
                    f"""(() => {{
                        const box = document.querySelector('ms-settings-publish-panel [role="textbox"][aria-label="Describe your app"]');
                        if (!box) return;
                        box.focus();
                        document.execCommand("selectAll", false, null);
                        document.execCommand("insertText", false, {json.dumps(description)});
                        box.dispatchEvent(new Event("input", {{ bubbles: true }}));
                    }})()""",
                )
            await asyncio.sleep(0.8)
            await eval_js(ws, c, """document.querySelector("ms-settings-publish-panel button.publish-button")?.click()""")
            print(f"Triggered Cloud Run deployment for https://{slug}.ai.studio ...")

        # Poll until Ready
        start = time.time()
        while time.time() - start < 240:
            await asyncio.sleep(4.0)
            p_txt = await eval_js(ws, c, """document.querySelector("ms-settings-publish-panel")?.innerText || "" """)
            if ("Status\nReady" in p_txt or "is published!" in p_txt) and "Publishing your app" not in p_txt:
                print(f"Published in {int(time.time() - start)}s!")
                break

        # Enable Share -> Public: Anyone with the link can view
        await eval_js(
            ws,
            c,
            """Array.from(document.querySelectorAll("mat-dialog-container button")).find(x => (x.innerText || "").trim() === "Share")?.click()""",
        )
        await asyncio.sleep(1.5)
        await eval_js(ws, c, """document.querySelector('mat-dialog-container mat-select[aria-label*="broadly shared"]')?.click()""")
        await asyncio.sleep(0.8)
        await eval_js(
            ws,
            c,
            """Array.from(document.querySelectorAll("mat-option, [role=option]")).find(o => /public|anyone/i.test(o.innerText || ""))?.click()""",
        )
        await asyncio.sleep(1.5)
        await eval_js(ws, c, """document.querySelector('mat-dialog-container button[aria-label="Close panel"]')?.click()""")


def ensure_public_cloud_run_invoker(project_id: str, slug: str) -> None:
    url = f"https://{slug}.ai.studio/"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            if r.status == 200:
                print(f"Verified public HTTP 200 on {url}")
                return
    except urllib.error.HTTPError as e:
        if e.code != 403:
            raise
        print(f"{url} returned 403 Forbidden — disabling Cloud Run invoker IAM gate via gcloud...")

    gcloud = shutil.which("gcloud") or "gcloud"
    svcs = json.loads(
        subprocess.check_output(
            [gcloud, "run", "services", "list", f"--project={project_id}", "--format=json"],
            text=True,
        )
    )
    managed = [
        s
        for s in svcs
        if s.get("metadata", {}).get("labels", {}).get("managed-by") == "google-ai-studio"
    ]
    for svc in managed:
        name = svc["metadata"]["name"]
        region = svc["metadata"]["labels"]["cloud.googleapis.com/location"]
        subprocess.run(
            [
                gcloud,
                "run",
                "services",
                "update",
                name,
                f"--region={region}",
                "--no-invoker-iam-check",
                f"--project={project_id}",
            ],
            check=True,
        )
    time.sleep(3)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        print(f"Verified public HTTP {r.status} on {url}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish an AI Studio app to Cloud Run + .ai.studio")
    parser.add_argument("--app-id", required=True, help="AI Studio app UUID")
    parser.add_argument("--project", required=True, help="Billing-enabled GCP project ID")
    parser.add_argument("--slug", required=True, help="Vanity .ai.studio subdomain (6-63 chars)")
    parser.add_argument("--description", default="", help="App description for Publish Step 3")
    args = parser.parse_args()

    asyncio.run(publish_in_aistudio(args.app_id, args.project, args.slug, args.description))
    ensure_public_cloud_run_invoker(args.project, args.slug)


if __name__ == "__main__":
    main()
