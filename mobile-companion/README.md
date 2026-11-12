# PyMasters Pocket — Google AI Studio & Cloud Run Mobile Companion

Lightweight mobile-first PWA & Android APK companion for **PyMasters** (`https://pymasters.net`).

## Highlights
- **Google AI Studio Compatible (`metadata.json` + `@google/genai`)**: Works out of the box with `GEMINI_API_KEY` in Google AI Studio OR keyless Vertex AI (`gemini-2.5-flash`) on Google Cloud Run.
- **4 Mobile-First Tabs**:
  1. **Home**: Quick-launch into Classroom & 13 Arcade games, PWA install prompt, and one-tap **Download Android APK (`418 KB`)**.
  2. **Drills**: Instant 60-second Python output & Big-O drills with explanations and XP tracking.
  3. **Code Lab**: Real in-browser Python 3 execution (Pyodide WebAssembly) with mobile-friendly starter templates.
  4. **AI Tutor**: Live Vaathiyaar AI Python chat powered by Gemini.
- **Automated Deployment**: Every push to `android/**` or `mobile-companion/**` triggers `.github/workflows/android.yml`, which compiles the Android `.apk` + `.aab`, embeds `PyMasters.apk` into `/download/PyMasters.apk`, and deploys `pymasters-mobile` to Google Cloud Run (`us-central1`).
