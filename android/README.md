# PyMasters for Android (`net.pymasters.app`)

Ultra-lightweight (~1.5 MB) native Kotlin Android app for **PyMasters** (`https://pymasters.net`).

## Features
- **Tiny Footprint (~1.5 MB R8-minified APK)**: Built directly on `androidx.activity.ComponentActivity` + `WebView` with zero heavy UI runtime bloat.
- **Native Android 12+ Splash & Edge-to-Edge Dark Chrome (`#020617`)**: Seamless transition into the PyMasters dark/light theme.
- **Instant Access to Full Platform**: Classroom lessons, Vaathiyaar AI Tutor (including microphone permission support for voice notes), Python Playground, Challenges, and all 13 Play & Arcade games.
- **Gesture-Protected Arcade & Playground**: Smart `SwipeRefreshLayout` disables pull-to-refresh automatically on `/dashboard/play` and `/dashboard/playground` (and whenever scrolled down) so touch controls in Linked Snake, Slingshot, and CodeMirror never misfire.
- **Native JS Bridge (`window.PyMastersAndroid`)**:
  - `haptic(ms)` — Crisp native `VibrationEffect` haptics for games & quizzes.
  - `share(title, text, url)` — Native Android Share Sheet.
  - `copyText(text)` — Native clipboard integration.
- **Home-Screen App Shortcuts & Deep Links**: Long-press the launcher icon to jump directly to **Classroom**, **Play**, **AI Tutor**, or **Playground**, plus `https://pymasters.net/*` and `pymasters://*` deep links.
- **Offline Recovery**: Branded native offline screen that automatically reloads as soon as Wi-Fi or mobile data reconnects.

## Local Build Commands

```bash
cd android

# Run unit tests
./gradlew testReleaseUnitTest

# Build R8-minified Release APK (~1.5 MB)
./gradlew assembleRelease

# Build Google Play Store App Bundle (.aab)
./gradlew bundleRelease
```

Outputs:
- **APK**: `android/app/build/outputs/apk/release/app-release.apk`
- **Play Store Bundle (AAB)**: `android/app/build/outputs/bundle/release/app-release.aab`

## Production Signing for Google Play Store

Generate an upload keystore once:

```bash
keytool -genkeypair -v \
  -keystore release-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias pymasters
```

Either create `android/keystore.properties` (git-ignored):

```properties
storeFile=release-keystore.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=pymasters
keyPassword=YOUR_KEY_PASSWORD
```

Or configure GitHub Repository Secrets for `.github/workflows/android.yml`:
- `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release-keystore.jks`)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
