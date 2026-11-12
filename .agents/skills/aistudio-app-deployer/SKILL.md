---
name: aistudio-app-deployer
description: Creates, syncs, previews, debugs, captures mobile screenshots, and deploys web and full-stack apps via Google AI Studio (aistudio.google.com/apps) and Eighty Browser CDP without local emulators or heavy local builds. Use when building, fixing, syncing with GitHub, or publishing apps to Cloud Run and free .ai.studio domains using Google AI Studio.
---

# Google AI Studio App Deployer (`aistudio-app-deployer`)

End-to-end zero-emulator workflow for developing, syncing, testing, screenshotting, and publishing applications through **Google AI Studio Build** (`https://aistudio.google.com/apps/<app-id>`) controlled via **Eighty Browser** (`/usr/local/bin/eighty`) CDP.

> **Read First on Complex Debugging**: See [references/architecture-and-gotchas.md](references/architecture-and-gotchas.md) for empirically validated container specs (`bun` preview vs. 2-container Cloud Run `nginx-container:8080` + `nodejs22` `app-container:3000`) and all 10 known failure modes.

---

## Core Constraints

1. **Browser**: Always use **Eighty Browser** (`/usr/local/bin/eighty`) on `--remote-debugging-port=9222`. Never launch `/usr/bin/chromium` or `/usr/lib/chromium/chromium` directly.
2. **Direct Target WebSocket CDP**: Never use Playwright's `connect_over_cdp("http://127.0.0.1:9222")` on Chromium 156+ (it times out on `chrome://omnibox-popup.top-chrome/`). Use `scripts/eighty_cdp.py` (`uv run --with websockets python3 ...`) to attach directly to page `webSocketDebuggerUrl`s in `<50ms`.
3. **Thermal Safety**: Never start `qemu-system` (Android Emulator) or Android Studio for web/PWA/TWA testing or Play Store screenshots; use `scripts/eighty_cdp.py mobile-screenshots` (`360×800` @ `3x` = `1080×2400` RGB PNGs).

---

## End-to-End Deployment Workflow

### Step 1: Attach Eighty Browser on CDP Port 9222

Verify `http://127.0.0.1:9222/json/version` is reachable. If Eighty Browser is running without `--remote-debugging-port=9222`, gracefully `SIGTERM` it (Eighty enforces `"RestoreOnStartup": 1`, preserving all user tabs) and launch `/usr/local/bin/eighty --remote-debugging-port=9222 "<aistudio-url>"` with `IsDaemon: true`.

```bash
uv run --with websockets python3 ~/.gemini/config/skills/aistudio-app-deployer/scripts/eighty_cdp.py list-tabs
```

### Step 2: Prepare & Sync Local Workspace to AI Studio

AI Studio Preview runs `bun install && bun run dev` at `/` (port `3000`), while AI Studio Cloud Run Publish runs `if [ -f server.js ]; then node server.js; else npm start; fi` at `/` (`PORT=3000`) inside a **`nodejs22` buildpack without `bun`**.

Run `scripts/aistudio_sync.py` to:
1. Generate/update root `package.json` (`node aistudio-bootstrap.mjs ...`) and `aistudio-bootstrap.mjs` (sets Vite `allowedHosts: true` on `0.0.0.0:3000`, builds `dist/`, serves SPA fallback + `/api` upstream reverse-proxy on `$PORT`, and optionally writes `/.well-known/assetlinks.json`).
2. Package a clean runtime `.zip` (`<800` files, avoiding AI Studio's ~1,087-file truncation and excluding `.env.example`, `tests/`, `docs/`, `node_modules/`, `.git/`, and VM `Dockerfile`s).
3. Prune `.env.example` and root `Dockerfile` (`aria-level="1"`) inside AI Studio's Code explorer, upload the `.zip` via `input[type="file"][accept=".zip"]`, switch to `Preview`, click **`Save`**, and verify live preview startup.

```bash
uv run --with websockets python3 ~/.gemini/config/skills/aistudio-app-deployer/scripts/aistudio_sync.py \
  --app-id "<AISTUDIO_APP_UUID>" \
  --repo "/path/to/repo" \
  --frontend-dir "frontend" \
  --backend-origin "https://api.example.com"
```

> **GitHub Sync Rule**: For monorepos where non-runtime folders (`tests/`, `android/`, `docs/`) were pruned inside AI Studio, **never** click AI Studio's `Settings → GitHub → More options → Force push`, which overwrites `main` with the pruned tree. Commit and `git push` from your full local repository instead.

### Step 3: Publish to Cloud Run & `<slug>.ai.studio` + Enable Public Access

Run `scripts/aistudio_publish.py` to automate AI Studio's 3-step `ms-settings-publish-panel` wizard and public IAM configuration:
1. Imports the billing-enabled GCP project (`Publish → Project dropdown → Import project`) if not yet imported.
2. **Step 1 (`Confirm project and billing`)**: Selects `--project` and clicks `Continue`.
3. **Step 2 (`Domain and URL`)**: Enters `--slug` (`<slug>.ai.studio`), verifies all 5 `check_circle` rules pass, and clicks `Continue with free URL`.
4. **Step 3 (`Final touches`)**: Sets `--description` and clicks `Publish your app` (or `Republish` if already live).
5. Switches **Share → General access** to **`Public: Anyone with the link can view`**.
6. Disables Cloud Run IAM invoker gating (`gcloud run services update <service> --region=<region> --no-invoker-iam-check --project=<project>`) when the AI Studio account only had `roles/editor` (fixing Google Frontend `403 Forbidden` without touching project IAM policies), then verifies HTTP `200` end-to-end.

```bash
uv run --with websockets python3 ~/.gemini/config/skills/aistudio-app-deployer/scripts/aistudio_publish.py \
  --app-id "<AISTUDIO_APP_UUID>" \
  --project "<GCP_PROJECT_ID>" \
  --slug "<vanity-subdomain>" \
  --description "Short production description of the app."
```

### Step 4: Capture `1080×2400` Mobile Store Screenshots (Optional)

Generate exact `1080×2400` (`360×800` @ `deviceScaleFactor: 3`) Play Store phone screenshots in an isolated temporary tab with zero CPU heat:

```bash
uv run --with websockets python3 ~/.gemini/config/skills/aistudio-app-deployer/scripts/eighty_cdp.py mobile-screenshots \
  --out-dir "./screenshots" \
  "01-home.png=https://<slug>.ai.studio/" \
  "02-pricing.png=https://<slug>.ai.studio/pricing"
```
