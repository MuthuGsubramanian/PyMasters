# Google Play Store Publishing — Validated Architecture, Policy Matrix & Play Console CDP Patterns

Every rule, API behavior, and DOM pattern below was empirically validated against Google Play Console (`play.google.com/console`), Google Play Android Publisher API v3, Google Play Billing Library v8.3+, and Eighty Browser CDP.

---

## 1. Personal vs. Organization Developer Account Lifecycle

Google Play enforces two distinct paths to Production:

1. **Personal Developer Accounts (Created After Nov 13, 2023)**:
   - Cannot publish directly to `Open testing` (`beta`) or `Production` on a newly created app.
   - **Exact Unlock Sequence**:
     1. Complete **`Internal testing`** (`3 of 3`: select testers + upload `.aab` + roll out release) for immediate install testing via `https://play.google.com/apps/internaltest/<id>`.
     2. Complete **`Finish setting up your app`** (`11 of 11`: 9 App Content declarations + Store Listing + Store Settings Category & Contact Email). Completing `11 of 11` unlocks **`Closed testing`**.
     3. Configure **`Closed testing - Alpha`** (`Select countries and regions`, `Select testers` with >= 12 real Google accounts, `Create and roll out a release`) and submit for Google Play review via `/publishing`.
     4. Once Google approves the Closed Testing review, **>= 12 testers must opt in** via the Closed Testing web link and remain opted in for **14 continuous days** (visible on `/app-dashboard` as `X testers currently opted in`).
     5. After 14 days, **`Apply for production`** unlocks on **Dashboard**, asking 3 short questionnaires about your closed test, after which **`Production`** (`--track production`) unlocks permanently for that app.
2. **Organization Developer Accounts (D-U-N-S Verified)**:
   - Exempt from the 12-tester / 14-day Closed Testing hold; can roll out directly to `internal`, `alpha`, `beta`, or `production` once the 11 setup items are complete.

---

## 2. Sixteen Empirical Play Store Rejection & Automation Gotchas

1. **WebView Third-Party Checkout Rejection (Payments Policy)**:
   - Apps selling digital content, courses, or Pro tiers inside an Android WebView **must not** load Stripe, Razorpay, PayPal, or `mailto:` upgrade links inside the Android app.
   - Remove payment hosts (`checkout.razorpay.com`, `checkout.stripe.com`) from WebView `IN_APP_HOSTS`, detect `window.<AppBridge>?.isAndroidApp?.()`, and invoke `BillingClient` (`com.android.billingclient:billing-ktx:8.3.0+`).
2. **Minimum Play Billing v8+ Floor**:
   - Play Console rejects releases compiled with `com.android.billingclient:billing-ktx:7.x` (`7.1.1`) as a blocking release error (`must be updated to at least version 8.0.0`). Always build with `8.3.0+` (`QueryProductDetailsResult` -> `result.productDetailsList`).
3. **Missing `com.android.vending.BILLING` Locks Play Console Products**:
   - Play Console disables **Subscriptions** and **One-time products** creation until at least one `.aab` declaring `<uses-permission android:name="com.android.vending.BILLING" />` is uploaded **and** a **Google Payments Merchant Account** is linked on the developer account.
4. **Dual-SHA256 Digital Asset Links (`assetlinks.json`)**:
   - Google Play App Signing re-signs your `.aab` with a Google-managed production certificate. Read the SHA-256 from `/app/<app-id>/keymanagement` and publish **both** the Upload key SHA-256 and Play App Signing SHA-256 in `https://<domain>/.well-known/assetlinks.json` (`Content-Type: application/json`, `Cache-Control: no-cache`).
   - Add an explicit Nginx `location /.well-known/ { try_files $uri =404; }` rule so missing files never return `200 text/html` (`index.html`).
5. **Transitive `AD_ID` Manifest Merger Trap**:
   - Analytics/Firebase/Play Services dependencies can silently merge `com.google.android.gms.permission.AD_ID` into your merged `AndroidManifest.xml`, causing Play Console to reject your `.aab` if you declared `Advertising ID = No`. Add:
     ```xml
     <uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />
     ```
6. **IARC Questionnaire Hidden Checkbox & IAP Flag**:
   - On IARC Step 1 (`Category`), the `Next` button remains disabled until you scroll down and check the **IARC Terms of Use** agreement checkbox.
   - When an app includes In-App Purchases or Subscriptions, set `"Does the app allow users to purchase digital goods?"` = **`Yes`** in IARC so the Play Store badge accurately shows `In-app purchases` alongside no-ads status.
7. **Data Safety Mandatory Account Deletion URL**:
   - Whenever an app supports account creation (`Username and password` or `OAuth`), Google Play **requires** a public web URL where users can request account & data deletion without reinstalling the app (e.g., `https://<domain>/delete-account`).
8. **Play Console AngularDart CDP Automation Rules**:
   - Play Console is built with **AngularDart** (`material-button`, `material-checkbox`, `material-radio`, `ess-table`, `ess-cell`), NOT standard React/HTML:
     - **Strip material icons before text matching**: `<material-button>` `innerText` often includes icon ligatures like `add\nAdd details` or `arrow_right_alt\nView issues`. Clone the node and remove `material-icon, i.material-icons, .material-icons-extended, [aria-hidden="true"]` before regex matching.
     - **Always call `Page.bringToFront`** before `Page.navigate`; AngularDart routes stall in background throttled tabs.
     - **Never call `scrollIntoView({block: 'center'})` inside `<ess-table>`** (e.g., Data Safety Step 4); it scrolls the table horizontally so the action button slides underneath the fixed `256px` left sidebar.
     - **Scroll-then-rect per field inside drawers**: When typing multiple `<input>` / `<textarea>` controls inside a scrollable drawer (such as `Add sign-in details`), call `el.scrollIntoView({block: 'center'})` and read `getBoundingClientRect()` **immediately before** clicking each field — batching `scrollIntoView` across all fields shifts earlier inputs off-screen so multiple fields share stale coordinates!
     - **Never set `Emulation.setDeviceMetricsOverride` wider/taller than physical window** if reusing an existing user tab; always open a fresh tab via `PUT http://127.0.0.1:9222/json/new?about:blank` and call `Emulation.clearDeviceMetricsOverride` in `finally`.
     - **Typing into `<material-input>`**: click via `Input.dispatchMouseEvent`, select-all + Backspace, send per-character `Input.dispatchKeyEvent({"type": "char", "text": ch})`, press `Tab` so Angular validation enables `Save` / `Add` / `Save and publish`.
9. **`edits.details().update()` API Caveat on Uninitialized Contact Email**:
   - Once Store Settings is initialized in UI (`Save and publish`), `edits.details().update(body={"defaultLanguage": "en-GB", "contactEmail": ..., "contactWebsite": ...})` keeps contact details synced on every release.
10. **Locale Mismatch (`en-GB` vs. `en-US`)**:
    - Play Console often defaults new developer accounts outside the US to `en-GB`. Uploading Fastlane metadata only to `en-US` leaves the default `en-GB` store listing blank (blocking `Set up your Store Listing`). Always pass `--languages en-GB,en-US`, or use `Next` -> `Next language` in Play Console UI.
11. **Monotonic `versionCode` & Idempotent Retries**:
    - Uploading the same `.aab` twice returns `HTTP 403: Version code N has already been used`. Catch `"already been used"`, call `edits.bundles().list()`, and reuse `versionCode` (or click **`Add from library`** in UI when promoting `internal` -> `alpha`).
12. **GitHub Actions `secrets.*` in Step `if:` Crashes in `0s`**:
    - Writing `if: secrets.PLAY_SERVICE_ACCOUNT_JSON != ''` on a workflow step causes GitHub Actions to reject the workflow at YAML parse time (`0s` failure). Pass the secret via `env:` and check `if [ -n "$VAR" ]; then ...` inside `run:`.
13. **`Missing sign-in details` Blocks `/publishing` Review Submission**:
    - Even if `App access` initially had `No` selected, Google Play's automated pre-launch crawler launches your start route, hits `/login`, and disables **`Submit changes for review`** with `1 issue affects all of your changes -> View issues -> Missing sign-in details`.
    - Always provision a persistent, onboarded non-admin reviewer account (saved in `~/.config/<app>/reviewer_credentials.json`) and declare it at `/app-content/testing-credentials` (`Is any part of your app restricted? = Yes` -> `Add details` -> `Name *`, `Username`, `Password`, `Instructions`, confirmation checkbox -> `Add` -> `Save`).
14. **`Publishing overview` Async Skeleton Checks**:
    - On `/publishing`, Play Console renders a loading skeleton placeholder for 5–20 seconds while checking pre-review policies (`Submit N changes for review` starts `disabled`). Always poll until either the button enables OR `View issues` appears rather than assuming `disabled` means failure immediately on load.
15. **WebView / SPA Scroll-Trap & Pull-to-Refresh Infinite Reload**:
    - Wrapping a responsive React/Vue app in `h-[100dvh] overflow-hidden` + `<main overflow-y-auto>` forces `window.scrollY === 0` at all times. On Android `WebView` (`SwipeRefreshLayout` or default overscroll) and mobile Chrome, downward drags get intercepted as pull-to-refresh instead of scrolling!
    - Fix both layers: use document-level scrolling below `lg` (`min-h-[100dvh] lg:h-[100dvh] overflow-x-clip lg:overflow-hidden`), set `overscroll-behavior-y: none` on `html, body`, remove `SwipeRefreshLayout`, configure `webView.overScrollMode = View.OVER_SCROLL_NEVER` + `webView.isNestedScrollingEnabled = false`, and inject a stylesheet enforcing `overscroll-behavior-y: none !important` in `onPageCommitVisible` / `onPageFinished`.
16. **CI Must Gate `compileDebugAndroidTestKotlin`**:
    - `./gradlew test lintRelease assembleRelease bundleRelease` skips `src/androidTest/` compilation! Removing a layout view (like `swipeRefresh`) leaves broken instrumented tests undetected until someone runs connected tests. Always include `compileDebugAndroidTestKotlin` in your CI Gradle command.
