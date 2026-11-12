#!/usr/bin/env python3
"""
Syncs a local frontend or monorepo project into Google AI Studio via Eighty Browser CDP.
Handles:
  - Root package.json + aistudio-bootstrap.mjs generation (Node + Bun compatible, port 3000 dev/prod, SPA + /api proxy)
  - Clean runtime .zip packaging (<800 files, skipping tests/docs/.env.example/node_modules/.git/VM Dockerfiles)
  - Deleting .env.example and root VM Dockerfile in AI Studio Code tree
  - Uploading .zip via DOM.setFileInputFiles, clicking 'Save', and verifying Vite preview boot
"""
import argparse
import asyncio
import json
import os
import pathlib
import tempfile
import zipfile
import websockets

from eighty_cdp import cdp_call, eval_js, find_page_target

SKIP_DIRS = {
    ".git",
    ".github",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
    "tests",
    "__tests__",
    "test",
    "docs",
    "audit",
    "android",
    ".agents",
}
SKIP_FILES = {".env", ".env.example", ".env.local", ".env.production", "Dockerfile", "docker-compose.yml"}
SKIP_SUFFIXES = {".jks", ".keystore", ".pyc", ".sqlite", ".db", ".aab", ".apk", ".log"}

BOOTSTRAP_TEMPLATE = """#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(ROOT, __FRONTEND_DIR__);
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || __BACKEND_ORIGIN__;
const mode = process.argv[2] || 'dev';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function ensureDeps() {
  const viteBin = path.join(FRONTEND, 'node_modules', '.bin', 'vite');
  if (fs.existsSync(viteBin)) return;
  try {
    execSync('bun install', { cwd: FRONTEND, stdio: 'inherit' });
  } catch {
    execSync('npm install --no-audit --no-fund', { cwd: FRONTEND, stdio: 'inherit' });
  }
}

function buildDist() {
  ensureDeps();
  const viteBin = path.join(FRONTEND, 'node_modules', '.bin', 'vite');
  execSync(`"${viteBin}" build`, { cwd: FRONTEND, stdio: 'inherit' });
  const rootDist = path.join(ROOT, 'dist');
  if (path.resolve(FRONTEND, 'dist') !== path.resolve(rootDist)) {
    fs.rmSync(rootDist, { recursive: true, force: true });
    fs.cpSync(path.join(FRONTEND, 'dist'), rootDist, { recursive: true });
  }
}

function startProd() {
  let distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    buildDist();
  }
  const port = Number(process.env.PORT || 3000);
  const upstream = BACKEND_ORIGIN ? new URL(BACKEND_ORIGIN) : null;

  http.createServer((req, res) => {
    const reqUrl = req.url || '/';
    if (upstream && (reqUrl === '/api' || reqUrl.startsWith('/api/'))) {
      const client = upstream.protocol === 'https:' ? https : http;
      const pReq = client.request(
        {
          protocol: upstream.protocol,
          hostname: upstream.hostname,
          port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
          method: req.method,
          path: reqUrl,
          headers: { ...req.headers, host: upstream.host },
        },
        (pRes) => {
          res.writeHead(pRes.statusCode || 502, pRes.headers);
          pRes.pipe(res);
        }
      );
      pReq.on('error', (e) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: e.message }));
      });
      req.pipe(pReq);
      return;
    }

    const clean = decodeURIComponent(reqUrl.split('?')[0]);
    const file = path.normalize(path.join(distDir, clean));
    if (file.startsWith(distDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    fs.createReadStream(path.join(distDir, 'index.html')).pipe(res);
  }).listen(port, '0.0.0.0', () => {
    console.log(`[AIStudioBootstrap] Listening on http://0.0.0.0:${port}`);
  });
}

if (mode === 'sync') {
  ensureDeps();
} else if (mode === 'build') {
  buildDist();
} else if (mode === 'start' || mode === 'preview') {
  startProd();
} else {
  ensureDeps();
  const viteBin = path.join(FRONTEND, 'node_modules', '.bin', 'vite');
  const port = process.env.PORT || '3000';
  const child = spawn(viteBin, ['--host', '0.0.0.0', '--port', String(port)], { cwd: FRONTEND, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}
"""


def ensure_bootstrap_files(repo: pathlib.Path, frontend_dir: str, backend_origin: str) -> None:
    pkg_path = repo / "package.json"
    bootstrap_path = repo / "aistudio-bootstrap.mjs"
    if not bootstrap_path.exists():
        content = BOOTSTRAP_TEMPLATE.replace("__FRONTEND_DIR__", json.dumps(frontend_dir)).replace(
            "__BACKEND_ORIGIN__", json.dumps(backend_origin)
        )
        bootstrap_path.write_text(content, encoding="utf-8")
        print(f"Created {bootstrap_path}")
    if not pkg_path.exists() and frontend_dir != ".":
        pkg = {
            "name": f"{repo.name.lower()}-aistudio-workspace",
            "private": True,
            "version": "1.0.0",
            "type": "module",
            "scripts": {
                "postinstall": "node aistudio-bootstrap.mjs sync",
                "dev": "node aistudio-bootstrap.mjs dev",
                "build": "node aistudio-bootstrap.mjs build",
                "start": "node aistudio-bootstrap.mjs start",
                "preview": "node aistudio-bootstrap.mjs preview",
            },
        }
        pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
        print(f"Created {pkg_path}")


def build_sync_zip(repo: pathlib.Path, frontend_dir: str, out_zip: pathlib.Path) -> int:
    count = 0
    include_roots = {frontend_dir, "package.json", "aistudio-bootstrap.mjs"}
    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(repo):
            rel_root = pathlib.Path(root).relative_to(repo)
            if rel_root != pathlib.Path(".") and rel_root.parts[0] not in include_roots:
                dirs[:] = []
                continue
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fname in files:
                if fname in SKIP_FILES:
                    continue
                fpath = pathlib.Path(root) / fname
                if fpath.suffix.lower() in SKIP_SUFFIXES:
                    continue
                arcname = fpath.relative_to(repo).as_posix()
                zf.write(fpath, arcname)
                count += 1
    return count


async def sync_to_aistudio(app_id: str, zip_path: pathlib.Path) -> None:
    target = find_page_target(app_id)
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
        c = [0]
        await cdp_call(ws, c, "Page.bringToFront")
        await cdp_call(ws, c, "DOM.enable")

        # Switch to Code view and collapse folders
        await eval_js(ws, c, """document.querySelector('button[aria-label="Code"]')?.click()""")
        await asyncio.sleep(1.0)
        await eval_js(
            ws,
            c,
            """Array.from(document.querySelectorAll("button")).find(b => (b.innerText || "").includes("collapse_all"))?.click()""",
        )
        await asyncio.sleep(0.5)

        # Delete root .env.example and root Dockerfile (aria-level="1") if present
        for bad_name in (".env.example", "Dockerfile"):
            found = await eval_js(
                ws,
                c,
                f"""(() => {{
                    const node = Array.from(document.querySelectorAll("mat-tree-node, [role='treeitem']"))
                        .find(n => n.getAttribute("aria-level") === "1" && (n.innerText || "").includes({json.dumps(bad_name)}));
                    if (node) {{ node.querySelector("button")?.click(); return true; }}
                    return false;
                }})()""",
            )
            if found:
                await asyncio.sleep(0.4)
                await eval_js(
                    ws,
                    c,
                    """Array.from(document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')).find(x => (x.innerText || "").includes("Delete"))?.click()""",
                )
                await asyncio.sleep(0.4)
                await eval_js(
                    ws,
                    c,
                    """Array.from(document.querySelectorAll('[role="dialog"] button, .cdk-overlay-pane button')).find(x => /delete|confirm|yes/i.test((x.innerText || "").trim()))?.click()""",
                )
                await asyncio.sleep(0.6)
                print(f"Removed root {bad_name} from AI Studio Code explorer.")

        # Upload runtime .zip via input[type="file"][accept*=".zip"]
        doc = await cdp_call(ws, c, "DOM.getDocument", {"depth": 1})
        q = await cdp_call(
            ws,
            c,
            "DOM.querySelectorAll",
            {"nodeId": doc["root"]["nodeId"], "selector": 'input[type="file"]'},
        )
        zip_idx = await eval_js(
            ws,
            c,
            """Array.from(document.querySelectorAll('input[type="file"]')).findIndex(el => (el.accept || "").includes(".zip"))""",
        )
        if zip_idx is None or zip_idx < 0:
            raise RuntimeError("Could not find zip upload input[type='file'] in AI Studio Code explorer.")

        await cdp_call(
            ws,
            c,
            "DOM.setFileInputFiles",
            {"nodeId": q["nodeIds"][zip_idx], "files": [str(zip_path)]},
        )
        print(f"Uploaded {zip_path.name} into AI Studio workspace.")
        await asyncio.sleep(2.5)

        # Switch to Preview and click Save to sync to remote preview container
        await eval_js(ws, c, """document.querySelector('button[aria-label="Preview"]')?.click()""")
        await asyncio.sleep(1.2)
        save_res = await eval_js(
            ws,
            c,
            """(() => {
                const btn = Array.from(document.querySelectorAll("button")).find(b => (b.innerText || "").trim() === "Save");
                if (btn) { btn.click(); return "CLICKED_SAVE"; }
                return "ALREADY_SAVED";
            })()""",
        )
        print(f"Save status: {save_res}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync local workspace into Google AI Studio")
    parser.add_argument("--app-id", required=True, help="AI Studio app UUID")
    parser.add_argument("--repo", required=True, help="Local repository root path")
    parser.add_argument("--frontend-dir", default="frontend", help="Frontend subdirectory ('.' if root)")
    parser.add_argument("--backend-origin", default="", help="Optional upstream API origin for /api proxy")
    args = parser.parse_args()

    repo = pathlib.Path(args.repo).resolve()
    ensure_bootstrap_files(repo, args.frontend_dir, args.backend_origin)

    with tempfile.NamedTemporaryFile(prefix="aistudio-sync-", suffix=".zip", delete=False) as tmp:
        zip_path = pathlib.Path(tmp.name)
    try:
        file_count = build_sync_zip(repo, args.frontend_dir, zip_path)
        print(f"Built clean sync archive ({file_count} files, {zip_path.stat().st_size / 1024:.1f} KB)")
        if file_count > 1000:
            print("WARNING: Archive exceeds 1,000 files; AI Studio may truncate files alphabetically.")
        asyncio.run(sync_to_aistudio(args.app_id, zip_path))
    finally:
        zip_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
