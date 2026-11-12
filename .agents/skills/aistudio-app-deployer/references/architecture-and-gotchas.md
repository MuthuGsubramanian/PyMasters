# Google AI Studio Apps & Eighty Browser CDP — Validated Architecture & Gotchas

Every behavior below was empirically validated against live Google AI Studio Build (`aistudio.google.com/apps/*`), Cloud Run (`managed-by: google-ai-studio`), and Eighty Browser (Chromium 156) on Linux.

---

## 1. Eighty Browser CDP Architecture (Zero-Emulator / Zero-Heat Workflow)

1. **Custom `--user-data-dir` Enables CDP on Port 9222**:
   - `/usr/local/bin/eighty` launches Chromium with `--user-data-dir=/home/pymaster/.local/share/eighty`. Because Chromium 136+ only blocks `--remote-debugging-port` on the *default* profile path, Eighty Browser accepts `--remote-debugging-port=9222` natively while keeping the user's authenticated Google sessions.
   - `/etc/chromium/policies/managed/eighty.json` sets `"RestoreOnStartup": 1`. If Eighty is running without `--remote-debugging-port=9222`, sending `SIGTERM` (`kill -TERM <pid>`), waiting for clean exit, and relaunching `/usr/local/bin/eighty --remote-debugging-port=9222` with `IsDaemon: true` restores all open tabs cleanly.
2. **Bypassing Playwright's Chrome 156 `connect_over_cdp` Timeout**:
   - Chromium 156 exposes internal `browser_ui` targets such as `chrome://omnibox-popup.top-chrome/` in `/json/list`. Playwright's `connect_over_cdp("http://127.0.0.1:9222")` hangs for 30s trying to attach to that target.
   - **Solution**: Query `http://127.0.0.1:9222/json/list`, filter for `"type": "page"` matching your target URL, and connect directly to its `webSocketDebuggerUrl` using `websockets` (`uv run --with websockets python3 ...`). Attachment takes `<50ms` with 100% reliability.
3. **Zero-Heat `1080×2400` Mobile Screenshots**:
   - Never start `qemu-system` / Android Emulator or Android Studio on thermally constrained laptops.
   - Open an isolated tab via `PUT http://127.0.0.1:9222/json/new?about:blank`, call `Page.bringToFront` (so `requestAnimationFrame` entrance animations finish rather than throttling in a background tab), set `Emulation.setDeviceMetricsOverride({"width": 360, "height": 800, "deviceScaleFactor": 3, "mobile": True})`, capture PNG with `clip: {x: 0, y: 0, width: 360, height: 800, scale: 1}`, and close the tab via `http://127.0.0.1:9222/json/close/<id>`.

---

## 2. Google AI Studio Preview Container vs. Cloud Run Production Pod

Google AI Studio uses **two distinct container architectures** for Preview vs. Published apps:

| Phase | Container Setup | Startup Command | Expected Port | Runtime |
| :--- | :--- | :--- | :--- | :--- |
| **Live Preview** (`ais-dev-*.run.app`) | Single dev container | `bun install` → `bun run dev` at `/` | `0.0.0.0:3000` | Node.js + Bun (`v1.4.x`) |
| **Published App** (`<slug>.ai.studio` / Cloud Run) | **2-container Cloud Run pod** (`nginx-container` + `app-container`) | `if [ -f server.js ]; then node server.js; else npm start; fi` | `nginx-container`: `8080` → `app-container`: `PORT=3000` | Google `nodejs22` buildpack (**NO `bun` installed!**) |

### Critical Implications
- **Always use `node` (not `bun`) in root `package.json` scripts** (`"dev": "node aistudio-bootstrap.mjs dev"`, `"build": "node aistudio-bootstrap.mjs build"`, `"start": "node aistudio-bootstrap.mjs start"`). `node` exists in **both** the Preview container and the Cloud Run `nodejs22` buildpack, whereas `bun` is absent in `nodejs22`.
- **`app-container` MUST listen on `process.env.PORT || 3000` (`0.0.0.0`)** when `npm start` runs, serving static assets from `./dist` with SPA fallback (`index.html`) AND reverse-proxying `/api/*` upstream if your backend lives on an external domain (avoids CORS `400/403` rejections).
- Note that `nginx-container` intercepts `/health` at the ingress layer while forwarding `/`, SPA routes, `/.well-known/assetlinks.json`, and `/api/*` to `app-container:3000`.

---

## 3. Ten Validated AI Studio Gotchas & Exact Fixes

1. **Monorepo Subdirectory Trap (`frontend/package.json`)**:
   - AI Studio runs `bun install` and `bun run dev` / `npm start` strictly at workspace root `/`. If your web app lives in `frontend/`, inject a root `package.json` + `aistudio-bootstrap.mjs` that installs/builds `frontend/`, copies `frontend/dist` to `./dist`, and serves/proxies from root.
2. **Vite 7 `Blocked request. This host is not allowed`**:
   - Vite 7 rejects `*.run.app` and `*.ai.studio` `Host` headers by default. Always configure `server: { host: '0.0.0.0', port: 3000, allowedHosts: true }` and `preview: { host: '0.0.0.0', allowedHosts: true }` in `vite.config.js`.
3. **~1,087-File GitHub Import Truncation**:
   - Importing a large repository into AI Studio silently truncates files alphabetically after ~1,087 files (e.g., `backend/tests/` with 600+ files causes `frontend/src/main.jsx` and `frontend/vite.config.js` to be omitted!).
   - **Fix**: Delete non-runtime folders (`tests`, `__tests__`, `docs`, `audit`) in AI Studio's Code tree and upload a clean runtime `.zip` (`<800` files) via `DOM.setFileInputFiles` on `input[type="file"][accept=".zip"]`. Zip uploads merge/overwrite cleanly with zero confirmation modal.
4. **`.env.example` Secret Prompt Blocker**:
   - AI Studio scans `.env.example` and blocks preview startup with `"Enter your environment variable to continue"` cards for every key in `.env.example`, and injects placeholder comments (like `# tests only`) into Cloud Run env vars!
   - **Fix**: Never include `.env.example` in the AI Studio workspace; delete it from the Code tree if imported.
5. **Root VM `Dockerfile` Override**:
   - If a repo has a custom multi-service VM `Dockerfile` (e.g., `supervisord` + `litestream` + `ollama`), Cloud Run build fails or misses files. Delete the root `Dockerfile` (`aria-level="1"`) inside AI Studio so Cloud Run uses the clean `nodejs22` buildpack.
6. **Staged Browser Edits Require Clicking `Save`**:
   - Uploading files via `DOM.setFileInputFiles` or editing Monaco models only stages changes in browser memory (`"Preview is outdated. Save to update."`). You **must** switch to `Preview` and click the `Save` button to sync changes to the remote container and persist a checkpoint.
7. **GCP Project Hidden in Publish Dropdown (`Permission denied` on Free Tier)**:
   - Default `my project (gen-lang-client-...)` lacks Cloud Billing and fails Publish. Open **Publish → Project dropdown → `Import project`**, select a billing-enabled GCP project in the modal, and click **`Import`**.
8. **3-Step Publish Wizard (`ms-settings-publish-panel`)**:
   - **Step 1 (`Confirm project and billing`)**: Select imported billing-enabled GCP project → click `Continue`.
   - **Step 2 (`Domain and URL`)**: Set `<slug>` in `ms-vanity-url-input input` (`6–63` chars, lowercase alphanumeric/hyphens) for a free `https://<slug>.ai.studio` URL → wait for 5 `check_circle` validations → click `Continue with free URL`.
   - **Step 3 (`Final touches`)**: Set app description in `[role="textbox"][aria-label="Describe your app"]` → click `button.publish-button` (`Publish your app`). Deployment takes ~90–120s.
9. **Post-Publish `403 Forbidden` on `<slug>.ai.studio` and `*.run.app`**:
   - Two causes:
     1. **Share tab**: Defaults to `Restricted: Only people you specify can access`. Switch **Share → General access** to **`Public: Anyone with the link can view`**.
     2. **Cloud Run Invoker Check**: If the AI Studio Google account has `roles/editor` (not `roles/run.admin` or `roles/owner`) on the GCP project, Cloud Run creates the service (`run.services.create`) without disabling IAM invoker checks (`run.services.setIamPolicy` is absent from `roles/editor`), causing Google Frontend `403 Forbidden`. Fix immediately via CLI (using an owner/admin gcloud account, without touching project-level IAM policies):
        ```bash
        gcloud run services update <service> --region=<region> --no-invoker-iam-check --project=<project-id>
        ```
10. **Never Click AI Studio's `Force push to <owner>/<repo>` on a Pruned Monorepo**:
    - Under **Settings → GitHub → More options**, AI Studio offers `Force push to <owner>/<repo>`, which **replaces `main` with the pruned AI Studio workspace** (wiping `backend/tests/`, `android/`, `docs/`, CI workflows!). Always push full repo commits from local Git (`git push origin main`) and sync runtime code *into* AI Studio via `.zip` upload.

---

## 4. Google Play Store TWA & Play Console CDP Gotchas

1. **Dual SHA-256 Fingerprints Required in `/.well-known/assetlinks.json`**:
   - Google Play App Signing re-signs uploaded `.aab` bundles with a Google-managed **App Signing key** whose SHA-256 differs from your local **Upload key** SHA-256.
   - Read the production SHA-256 from Play Console (`/app/<app-id>/keymanagement`) after uploading your first `.aab`, and include **both** the Upload key SHA-256 and Play App Signing SHA-256 in `sha256_cert_fingerprints` so Trusted Web Activity (TWA) URL-bar removal succeeds on both local APK installs and Play Store installs.
2. **Play Console AngularDart Requires Real CDP Mouse Events**:
   - Play Console (`play.google.com/console`) uses AngularDart (`material-button`, `material-checkbox`, `ess-cell`). Synthetic `element.click()` often fails to open drawers/modals (such as Data Safety's `Open <type> questions`). Always set a wide desktop viewport (`1440×960`) and dispatch real CDP `Input.dispatchMouseEvent` (`mousePressed` + `mouseReleased`) at the element's bounding-box center.
3. **Keyless `androidpublisher` v3 API Publishing**:
   - When GCP org policies block service account JSON keys (`iam.disableServiceAccountKeyCreation`), invite `<sa>@<project>.iam.gserviceaccount.com` in Play Console **Users and permissions** and authenticate via `google.auth.impersonated_credentials.Credentials` (`scope: https://www.googleapis.com/auth/androidpublisher`).
