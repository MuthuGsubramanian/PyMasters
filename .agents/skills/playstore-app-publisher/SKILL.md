---
name: playstore-app-publisher
description: End-to-end Google Play Store Android app publishing, WebView/SPA touch-scroll pre-flight verification, cloud CI AAB building, Play Billing v8+ IAP integration, Digital Asset Links dual-SHA256 verification, Sign-in details + 10/10 App Content declarations, multi-track rollout (Internal, Closed Alpha, Open Beta, Production), and Play Console CDP automation without Android Studio or local emulators. Use when preparing, testing, auditing, updating, or publishing an Android or WebView/TWA app to Google Play Store.
---

# Google Play Store App Publisher (`playstore-app-publisher`)

End-to-end zero-emulator workflow for hardening, verifying, packaging (`.aab`), declaring, and shipping Android or WebView/TWA apps to **Google Play Store** via GitHub Actions cloud runners, the **Google Play Android Publisher API v3**, and **Eighty Browser CDP**.

> **Deep Technical Reference**: Read [references/play-console-deep-dive.md](./references/play-console-deep-dive.md) for empirically validated Play Console AngularDart DOM rules, Personal vs. Organization Closed Testing gates, Google Play Payments Policy WebView rules, and all 16 Play Store rejection & review-block traps.

---

## Bundled Reusable Tooling

| Tool | Purpose |
| :--- | :--- |
| [scripts/verify_mobile_webview_scroll.mjs](./scripts/verify_mobile_webview_scroll.mjs) | Pre-flight CDP touch-swipe audit (`Input.dispatchTouchEvent`) across public + logged-in routes (`scrollWidth <= innerWidth`, downward/upward scroll movement, zero pull-to-refresh reload). |
| [scripts/capture_playstore_screenshots.py](./scripts/capture_playstore_screenshots.py) | Captures validated `1080×2400` (`360×800 @ 3x`) phone screenshots into a release pack and Fastlane directory using an isolated CDP tab. |
| [scripts/play_publish_api.py](./scripts/play_publish_api.py) | Uploads signed `.aab` + multi-locale (`en-GB,en-US`) Fastlane listings & graphics via Google Play Android Publisher API v3 (keyless impersonation or JSON key). |
| [scripts/play_console_cdp.mjs](./scripts/play_console_cdp.mjs) | Automated Play Console UI toolkit (`inspect`, `set-sign-in-details`, `sync-listing`, `release-track` with `Add from library`, and `/publishing` review submission). |

---

## Core Constraints

1. **Zero Local Emulator / Zero Android Studio**: Run `./gradlew test compileDebugAndroidTestKotlin lintRelease assembleRelease bundleRelease --no-daemon` on GitHub Actions (`ubuntu-latest`, JDK 21). Never launch Android Studio or `qemu-system`.
2. **Browser Rule**: Always control **Eighty Browser** (`/usr/local/bin/eighty`) via `127.0.0.1:9222`. Create temporary tabs (`PUT /json/new?about:blank`), run `Emulation.clearDeviceMetricsOverride` before disconnect, and close temporary tabs in `finally`.
3. **Secret Hygiene**: Never commit `.jks` keystores, `keystore.properties`, reviewer credentials, or service account JSON keys. Keep signing secrets in `~/.config/<app>/keystore/` and reviewer demo logins in `~/.config/<app>/reviewer_credentials.json` (`chmod 600`).

---

## 9-Phase Play Store Publishing & Update Workflow

### Phase 1: Android Shell, Billing v8+, Zero-Ads, & Scroll Hardening

1. **SDK, Versioning & Tests (`android/app/build.gradle.kts`)**:
   - Set `compileSdk = 36`, `targetSdk = 36`, and `androidx.fragment:fragment-ktx:1.8.6+`.
   - Bump `versionCode` monotonically on every Play Console upload (never reuse a `versionCode`).
   - Avoid dead `SwipeRefreshLayout` dependencies in `build.gradle.kts` / `androidTest` — gate `compileDebugAndroidTestKotlin` in CI alongside `test`, `lintRelease`, `assembleRelease`, and `bundleRelease`.
2. **WebView Scroll & Pull-to-Refresh Anti-Trap (`MainActivity.kt` + Web SPA)**:
   - Do **not** wrap `WebView` in `SwipeRefreshLayout` when hosting scrollable web content.
   - Set `webView.overScrollMode = View.OVER_SCROLL_NEVER`, `webView.isNestedScrollingEnabled = false`, and inject `html,body{overscroll-behavior-y:none !important;overscroll-behavior-x:none !important;}` in `onPageCommitVisible` / `onPageFinished`.
   - Keep authenticated mobile shells (`<lg` / `<1024px`) scrollable at the **document/window** level rather than trapping content inside `h-[100dvh] overflow-hidden` + `<main overflow-y-auto>` (which keeps `window.scrollY === 0` permanently and triggers pull-to-refresh on downward drags).
   - Expand `MainActivity` `android:configChanges` to `orientation|screenSize|smallestScreenSize|screenLayout|keyboard|keyboardHidden|navigation|uiMode|density` with `windowSoftInputMode="adjustResize"`.
3. **Play Billing v8+ & Payments Policy**:
   - Use **`com.android.billingclient:billing-ktx:8.3.0+`** (Google Play rejects `< 8.0.0`) with `<uses-permission android:name="com.android.vending.BILLING" />`.
   - Never load third-party web checkouts (Stripe, Razorpay, PayPal) inside Android `WebView` (`IN_APP_HOSTS` must exclude them); route digital purchases via `BillingClient.launchBillingFlow()` and verify receipts server-side.
4. **Hard Zero-Ads Enforcement**:
   - Declare `<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />` in `AndroidManifest.xml` when `Ads = No` and `Advertising ID = No`.

### Phase 2: Pre-Flight Live Mobile Touch-Scroll Audit

Before building or uploading a release, verify real finger drags on the live Web/Companion URLs across both public and authenticated screens:

```bash
node ./scripts/verify_mobile_webview_scroll.mjs \
  --origin "https://example.com" \
  --routes "/,/pricing,/guides" \
  --auth-routes "/dashboard,/dashboard/classroom,/dashboard/playground" \
  --login-path "/login" \
  --credentials-file "$HOME/.config/myapp/reviewer_credentials.json"
```
**Validation**: Confirm `ALL N/N mobile touch-scroll & overflow checks PASSED` (`overflowPx <= 0`, downward swipe increases `scrollY`, upward swipe decreases `scrollY` without triggering page reload).

### Phase 3: Cloud CI Build & Artifact Download (`ubuntu-latest`)

Trigger or watch GitHub Actions until `test`, `compileDebugAndroidTestKotlin`, `lintRelease`, `assembleRelease`, and `bundleRelease` pass, then download the signed `.aab` + `.apk`:

```bash
gh workflow run android.yml --ref main
RUN_ID=$(gh run list --workflow=android.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
gh run download "$RUN_ID" -D ./scratch/release
```
> Bind CI secrets (`ANDROID_KEYSTORE_BASE64`, `PLAY_SERVICE_ACCOUNT_JSON`) via `env:` and check `if [ -n "$VAR" ]; then ...` in shell — never put `secrets.*` directly in step-level `if:`.

### Phase 4: Dual-SHA256 Digital Asset Links (`/.well-known/assetlinks.json`)

1. After uploading the first `.aab`, copy the **App signing key certificate SHA-256** from Play Console (`App integrity → Play app signing`).
2. Publish **both** your Upload key SHA-256 and Play App Signing SHA-256 at `https://<domain>/.well-known/assetlinks.json` (`Content-Type: application/json`, explicit Nginx `location /.well-known/` handler).

### Phase 5: Phone Screenshots & Dual-Locale Store Listing (`en-GB` + `en-US`)

1. Capture clean `1080×2400` phone screenshots:
   ```bash
   uv run --with websockets python3 ./scripts/capture_playstore_screenshots.py \
     --out-dir ./scratch/screenshots \
     --fastlane-dir android/fastlane/metadata/android/en-US/images/phoneScreenshots \
     --url 01-home.png=https://example.com/ \
     --url 02-features.png=https://example.com/pricing
   ```
2. Update `title.txt` (<=30 chars), `short_description.txt` (<=80 chars), `full_description.txt` (<=4000 chars), and `changelogs/<versionCode>.txt` (<=500 chars).
3. Sync across **both `en-GB` and `en-US`** (API or CDP):
   ```bash
   node ./scripts/play_console_cdp.mjs sync-listing \
     --dev-id "<DEV_ID>" --app-id "<APP_ID>" \
     --metadata-dir android/fastlane/metadata/android/en-US
   ```

### Phase 6: Sign-in Details (`App access`) & App Content (`11 of 11`)

Every login-gated or dashboard-first app **must** provide working reviewer credentials, or Play Console blocks submission with **`Missing sign-in details`** during `/publishing` checks:

1. Provision a dedicated non-admin demo account (with onboarding pre-completed) in `~/.config/<app>/reviewer_credentials.json`.
2. Submit it via Play Console **Sign-in details** (`/app-content/testing-credentials`):
   ```bash
   node ./scripts/play_console_cdp.mjs set-sign-in-details \
     --dev-id "<DEV_ID>" --app-id "<APP_ID>" \
     --name "Standard Reviewer Account" \
     --credentials-file "$HOME/.config/myapp/reviewer_credentials.json"
   ```
3. Complete the remaining App Content items (`Privacy policy`, `Ads = No`, `IARC Content rating` with `Digital goods = Yes` if IAP exists, `Target audience = 13+`, `Data safety` + live `Delete account URL`, `Advertising ID = No`, `Financial/Health/Government`) and **Store settings** (`App category` + contact email/website -> **Save and publish**).

### Phase 7: Automated API Upload vs. Play Console CDP Release

- **API Route (when `PLAY_SERVICE_ACCOUNT_JSON` / impersonation is linked as Admin in Play Console)**:
  ```bash
  uv run --with google-api-python-client --with google-auth python3 ./scripts/play_publish_api.py \
    --package "com.example.app" \
    --aab "./scratch/release/PyMasters-Android-AAB/app-release.aab" \
    --metadata-dir "android/fastlane/metadata/android/en-US" \
    --languages "en-GB,en-US" \
    --contact-email "support@example.com" \
    --contact-website "https://example.com" \
    --impersonate "play-publisher@my-gcp.iam.gserviceaccount.com" \
    --track internal --status completed
  ```
- **CDP Route (zero service-account dependency; supports library reuse + Closed Alpha + `/publishing` submit)**:
  ```bash
  # 1. Roll out immediately to Internal testers
  node ./scripts/play_console_cdp.mjs release-track \
    --dev-id "<DEV_ID>" --app-id "<APP_ID>" --track internal \
    --aab "./scratch/release/PyMasters-Android-AAB/app-release.aab" \
    --version-code 8 --version-name "1.1.6" \
    --notes-file android/fastlane/metadata/android/en-US/changelogs/8.txt

  # 2. Promote the exact same bundle from library to Closed Testing (Alpha) & submit for review
  node ./scripts/play_console_cdp.mjs release-track \
    --dev-id "<DEV_ID>" --app-id "<APP_ID>" --track alpha \
    --version-code 8 --version-name "1.1.6" \
    --notes-file android/fastlane/metadata/android/en-US/changelogs/8.txt \
    --submit
  ```

### Phase 8: Track Progression & Production Gate (`Internal` -> `Closed` -> `Production`)

| Track | Availability & Speed | Production Access Gate |
| :--- | :--- | :--- |
| **`internal`** | Live in seconds for tester email list (`<=100`); skips Play review delay. | Immediate verification of Play App Signing, deep links, scrolling, and billing. |
| **`alpha` (Closed)** | Pre-release testers + full Google Play policy review. | **Personal accounts (post-Nov 2023)**: Requires **>= 12 opted-in testers continuously for 14 days** before **Apply for production** unlocks.<br>**Organization accounts**: No 12-tester/14-day hold. |
| **`beta` (Open)** | Open Play Store test link without closed email list cap. | Available once closed/production requirements are met. |
| **`production`** | Full global Google Play Store release. | Submit release + resolve any `/publishing` checks (`View issues`) -> **`Submit changes for review`**. |

### Phase 9: Final Verification Gate

Run `inspect` and verify zero unresolved blockers remain:
```bash
node ./scripts/play_console_cdp.mjs inspect --dev-id "<DEV_ID>" --app-id "<APP_ID>"
```
Confirm:
- `Internal testing` shows the new `versionCode (versionName)` as **`Available to internal testers`**.
- `Closed testing - Alpha` shows the new release **`In review`** or **`Available to selected testers`** (not stuck on an old `versionCode` in `Changes not yet submitted for review`).
- `/publishing` has zero `1 issue affects all of your changes` error banners.
