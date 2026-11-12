---
name: playstore-app-publisher
description: End-to-end Google Play Store Android app publishing, cloud CI AAB building, Google Play Billing v7 IAP integration, Digital Asset Links dual-SHA256 verification, 10/10 App Content policy declarations, multi-track rollout (Internal, Closed, Open, Production), and Play Console CDP automation without Android Studio or local emulators. Use when preparing, testing, auditing, or publishing an Android or WebView/TWA app to Google Play Store.
---

# Google Play Store App Publisher (`playstore-app-publisher`)

End-to-end zero-emulator, zero-Android-Studio workflow for building, testing, policy-declaring, monetizing (Google Play Billing v7, Zero Ads), and publishing Android apps to **Google Play Store** via GitHub Actions cloud runners, the **Google Play Android Publisher API v3**, and **Eighty Browser CDP**.

> **Deep Technical Reference**: Read [references/play-console-deep-dive.md](references/play-console-deep-dive.md) for empirically validated Play Console AngularDart DOM automation rules, Personal vs. Organization account Closed Testing gates, Google Play Payments Policy WebView rules, and all 12 Play Store rejection traps.

---

## Core Constraints

1. **Zero Local Emulator / Zero Android Studio**: Never launch Android Studio, `qemu-system`, or heavy local `./gradlew` builds on thermally constrained machines. Run `./gradlew test lintRelease assembleRelease bundleRelease --no-daemon` on GitHub Actions (`ubuntu-latest`, JDK 21) and capture `1080×2400` (`360×800` @ `3x`) phone screenshots via Eighty Browser CDP.
2. **Browser Rule**: Always control **Eighty Browser** (`/usr/local/bin/eighty`) via direct page-target WebSocket CDP on port `9222`. Never launch `/usr/bin/chromium` directly.
3. **Secret Hygiene**: Never commit `.jks` keystores, `keystore.properties`, or service account JSON keys. Store signing secrets in `~/.config/<app>/keystore/` (chmod `600`) and GitHub Actions Secrets, and use keyless service account impersonation (`--impersonate`) for API uploads.

---

## 8-Phase Play Store Publishing Workflow

### Phase 1: Android Manifest, Play Billing v7 (IAP), & Zero-Ads Hardening

1. **SDK & Versioning (`app/build.gradle.kts`)**:
   - Set `compileSdk = 36` and `targetSdk = 36` (Google Play mandatory API target requirement).
   - Increment `versionCode` monotonically for every Play Console upload (`versionCode` can never be reused once uploaded, even on `internal` draft edits).
2. **In-App Purchases (`com.android.billingclient:billing-ktx:7.1.1`)**:
   - Add `com.android.billingclient:billing-ktx:7.1.1` and `<uses-permission android:name="com.android.vending.BILLING" />`. Without this permission in an uploaded `.aab`, Play Console locks **Monetize with Play → Subscriptions / One-time products**.
   - **Critical WebView Payments Policy Rule**: If your app embeds a web frontend, **never** load third-party web checkouts (Razorpay, Stripe, PayPal) for digital goods/subscriptions inside the Android WebView (`IN_APP_HOSTS` must exclude payment gateway domains). Detect the Android bridge (`window.<AppBridge>?.isAndroidApp?.()`) and route digital upgrades exclusively through `BillingClient.launchBillingFlow()`, verifying `purchaseToken` server-side via `androidpublisher` v3 (`purchases.subscriptionsv2.get` / `purchases.products.get`).
3. **Hard Zero-Ads Enforcement**:
   - If the app has **no ads**, add `<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />` in `AndroidManifest.xml` so transitive libraries never inject `AD_ID`, matching Play Console's `Ads = No` and `Advertising ID = No` declarations.

### Phase 2: Web + Mobile State Synchronization & OAuth Parity

1. **Single Authoritative Backend**: Point Android (`BuildConfig.BASE_URL`), Web, and any companion PWAs (via `/api/*` server-to-server reverse proxy) to the same backend database and JWT issuer so lessons, completions, XP, streaks, and Pro entitlements sync in `<1s`.
2. **WebView Storage & OAuth Whitelist**: Enable `domStorageEnabled = true`, call `CookieManager.getInstance().flush()` in `onPause()` and `onPageFinished()`, and keep OAuth provider paths (`accounts.google.com`, `github.com/login`, `www.linkedin.com/oauth/`) inside the WebView so `HttpOnly; SameSite=Lax` OAuth state cookies survive redirects.

### Phase 3: Cloud CI Build, Unit Tests, & Lint (`ubuntu-latest`)

1. Run `./gradlew test lintRelease assembleRelease bundleRelease --no-daemon` in GitHub Actions with `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
2. **GitHub Actions YAML Gotcha**: Never write `if: secrets.MY_SECRET != ''` at the step level (GitHub Actions rejects the workflow in `0s` with `"workflow file issue"`). Bind the secret in `env:` and check `if [ -n "$MY_SECRET" ]; then ... fi` inside `run:`.
3. Trigger and download artifacts without local compilation:
   ```bash
   gh workflow run android.yml --ref main
   RUN_ID=$(gh run list --workflow=android.yml --limit 1 --json databaseId -q '.[0].databaseId')
   gh run watch "$RUN_ID" --exit-status
   gh run download "$RUN_ID" -D ./artifacts
   ```

### Phase 4: Create App & Link Keyless Publisher Service Account

1. Create the app manually once in Play Console (`Create app` — Google Play API cannot create a brand-new app; the first `.aab` or app creation happens in UI, after which `androidpublisher` v3 automates everything).
2. In **Users and permissions → Invite new users**, invite `<publisher-sa>@<gcp-project>.iam.gserviceaccount.com` and grant **Admin (all permissions)** on the app.

### Phase 5: Dual-SHA256 Digital Asset Links (`/.well-known/assetlinks.json`)

1. Upload your first `.aab` so Google Play App Signing generates its production certificate.
2. Read the **App signing key certificate SHA-256** from Play Console (`Test and release → App integrity → Play app signing` / `/keymanagement`).
3. Serve **both** your **Upload key SHA-256** and **Play App Signing SHA-256** at `https://<domain>/.well-known/assetlinks.json` (`Content-Type: application/json`, `Cache-Control: no-cache`, explicit Nginx `location /.well-known/` block so missing files never return `200 text/html` SPA fallback).

### Phase 6: Complete All 10 App Content Declarations & Store Settings (`11 of 11`)

Complete every item under **Monitor and improve → Policy and programmes → App content** plus **Grow users → Store presence → Store settings**:
1. **Privacy policy**: Live HTTPS URL (`https://<domain>/privacy`).
2. **App access**: Provide test credentials if login-gated, or `All functionality is available without special access` if guest mode exists.
3. **Ads**: `No, my app does not contain ads` (when ad-free).
4. **Content rating (IARC)**: Select category, accept IARC Terms checkbox, set **Digital goods / In-App Purchases = `Yes`** when offering subscriptions/IAP.
5. **Target audience**: Select `13–15`, `16–17`, `18 and over` (selecting under-13 triggers strict Google Play Families Policy restrictions).
6. **Data safety**: Declare `Encrypted in transit = Yes`, live `Delete account URL` (`https://<domain>/delete-account`), auth methods, and exact data types (`Email address` → `Collected`, `Not ephemeral`, `App functionality` + `Account management`; plus `Purchase history` if storing IAP receipts).
7. **Advertising ID**: `No` (paired with `tools:node="remove"` on `AD_ID`).
8. **Government apps / Financial features / Health apps**: Declare accurately (`My app doesn't provide any financial features` applies even when selling standard digital subscriptions via Google Play Billing).
9. **Store settings (`11 of 11`)**: Select **App category** (e.g., `Education`) and save **Store Listing contact details** (`Email address` + `Website` via **Save and publish**). Completing `11 of 11` unlocks **Closed testing**.

> **Monetization Prerequisite**: To create Subscriptions or One-Time Products in Play Console (`Monetise with Play → Products`), the developer account owner must complete **Set up a merchant account** (Google Payments Merchant profile + bank/tax verification) AND have uploaded at least one `.aab` containing `com.android.vending.BILLING`.

### Phase 7: Automated API Upload & Multi-Track Progression

Use `scripts/play_publish_api.py` to upload the `.aab`, `en-GB` + `en-US` store listings, `512×512` icon, `1024×500` feature graphic, and `1080×2400` phone screenshots:

```bash
uv run --with google-api-python-client --with google-auth python3 \
  ~/.gemini/config/skills/playstore-app-publisher/scripts/play_publish_api.py \
  --package "com.example.app" \
  --aab "./artifacts/app-release.aab" \
  --metadata-dir "android/fastlane/metadata/android/en-US" \
  --languages "en-GB,en-US" \
  --contact-email "support@example.com" \
  --contact-website "https://example.com" \
  --impersonate "play-publisher@my-gcp-project.iam.gserviceaccount.com" \
  --track internal \
  --status completed
```

### Phase 8: Testing Phases & Production Gate (`Internal` → `Closed` → `Open` → `Production`)

| Track (`--track`) | Purpose & Speed | Tester Setup | Production Gate Rules |
| :--- | :--- | :--- | :--- |
| **`internal`** | Instant QA distribution (live in seconds, bypasses review delay) | Email list (up to 100 testers) + `Join on the web` URL (`https://play.google.com/apps/internaltest/...`) | Required sanity check for Play App Signing, deep links, and license-tester Play Billing flows. |
| **`alpha` (Closed testing)** | Mandatory pre-production verification & Google Play policy review | Countries/regions (`All countries`) + Email list / Google Group + submit in **Publishing overview** | **Personal accounts (created after Nov 13, 2023)**: Must have **>= 12 testers opted-in continuously for 14 days** on Closed Testing before **Apply for production** unlocks.<br>**Organization accounts**: No 12-tester/14-day hold; can promote directly to `beta` / `production` once reviewed. |
| **`beta` (Open testing)** | Public beta on Play Store search without tester list cap | Set countries + optional tester cap | Unlocks after Closed Testing / Production access requirements are satisfied. |
| **`production`** | Full public Google Play release | Countries/regions + staged or 100% rollout | Submit release + click **Send changes for review** in **Publishing overview** if Managed Publishing is on. |
