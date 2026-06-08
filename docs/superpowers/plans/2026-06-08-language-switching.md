# Effective Language Switching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a learner's chosen language drive the AI tutor and learning content: a persistent Settings switcher, Vaathiyaar chat + generated lessons answered/authored in the selected language, and an offline batch translator that localizes pre-built lessons.

**Architecture:** `ProfileContext` is the single source of `language`; the backend resolves `preferred_language` server-side for Vaathiyaar (`modelfile.build_system_prompt`) and the generation pipeline. An offline CLI translator fills existing lesson locale-maps via a local Ollama model (so it can never touch code).

**Tech Stack:** FastAPI + SQLite backend, Vaathiyaar (Ollama) prompts; React 19 + Vite + Tailwind frontend; local Ollama for the offline translator.

**Spec:** `docs/superpowers/specs/2026-06-08-language-switching-design.md`

**Verification:** Live user testing (no unit suites). Per-task checks are code-level (`python -m py_compile`, `npx eslint`, `npm run build`); the full live pass is LS-6.

## Git hygiene (every task)
~400 pre-existing dirty files. **Stage only the exact file(s) each task touches** — never `git add -A`/`.`/`-a`. Branch `feat/language-switching` (checked out). End commit bodies with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure
- **Modify** `backend/vaathiyaar/modelfile.py` — `LANG_NAMES` constant + generalized language rule.
- **Modify** `backend/modules/pipeline.py` — author generated lessons in the user's language.
- **Modify** `frontend/src/context/ProfileContext.jsx` — `language` + `setLanguage`.
- **Modify** `frontend/src/pages/Profile.jsx` (settings) + `frontend/src/components/LanguageSelector.jsx` (restyle) + `frontend/src/pages/Classroom.jsx` (use context language).
- **Create** `backend/i18n/translate_lessons.py` — offline batch translator.

---

## Task LS-1: Generalize Vaathiyaar's language rule to all supported languages

**Files:** Modify `backend/vaathiyaar/modelfile.py`

- [ ] **Step 1: Add a shared LANG_NAMES constant**

Near the top of `modelfile.py` (module level, after imports), add:
```python
LANG_NAMES = {
    "en": "English",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
    "fr": "French",
    "es": "Spanish",
    "it": "Italian",
    "ko": "Korean",
    "tanglish": "Tanglish (Tamil + English mix)",
}
```

- [ ] **Step 2: Use LANG_NAMES for the label**

Replace the inline `lang_label = {...}.get(preferred_language, preferred_language)` block (currently ~lines 490-494) with:
```python
    lang_label = LANG_NAMES.get(preferred_language, preferred_language)
```

- [ ] **Step 3: Generalize the language instruction**

Replace the `if preferred_language == "ta": ... elif "tanglish": ... else: ...` block (currently ~lines 566-591) with:
```python
    # --- Language instruction (covers all supported languages) ---
    if preferred_language == "ta":
        lang_instruction = (
            "\n## Language Instruction\n\n"
            "CRITICAL LANGUAGE RULE: You MUST respond ENTIRELY in Tamil script (தமிழ்). "
            "Every word of the 'message' field must be in Tamil. Do NOT mix English words "
            "except for Python keywords and code terms. This is non-negotiable. "
            "All JSON keys and non-message values must remain in English.\n"
        )
    elif preferred_language == "tanglish":
        lang_instruction = (
            "\n## Language Instruction\n\n"
            "CRITICAL LANGUAGE RULE: You MUST respond in Tanglish — a natural mix of Tamil "
            "(romanised) and English, exactly as spoken by Tamil tech professionals. Every "
            "sentence in the 'message' field must blend Tamil and English naturally. Do NOT "
            "write full sentences in pure English alone. Technical terms and code stay in "
            "English. All JSON keys and non-message values remain in English. This is "
            "non-negotiable.\n"
        )
    elif preferred_language in LANG_NAMES and preferred_language != "en":
        _ln = LANG_NAMES[preferred_language]
        lang_instruction = (
            "\n## Language Instruction\n\n"
            f"CRITICAL LANGUAGE RULE: You MUST respond ENTIRELY in {_ln} using its native "
            f"script. Every word of the 'message' field must be in {_ln}. Keep Python "
            "keywords, code, code identifiers, and ALL JSON keys and non-message values in "
            "English. Do NOT answer in English prose. This is non-negotiable.\n"
        )
    else:
        lang_instruction = (
            "\n## Language Instruction\n\n"
            "CRITICAL LANGUAGE RULE: You MUST respond ENTIRELY in English. Keep responses "
            "professional and educational. Do NOT mix other languages. Sprinkle Tamil words "
            "only where they add cultural warmth, always with the English meaning in "
            "parentheses immediately after. This is non-negotiable.\n"
        )
```

- [ ] **Step 4: Verify** — `python -m py_compile backend/vaathiyaar/modelfile.py` → exit 0. Confirm `LANG_NAMES` defined once and the new `elif` covers te/ml/fr/es/it/ko.

- [ ] **Step 5: Commit**
```bash
git add backend/vaathiyaar/modelfile.py
git commit -m "feat(i18n): Vaathiyaar responds in any supported language (generalize rule)"
```

---

## Task LS-2: Generate lessons in the user's language

**Files:** Modify `backend/modules/pipeline.py`

- [ ] **Step 1: Resolve the user's language at pipeline start**

`run_pipeline(job_id, user_id, topic)` already imports `get_student_profile`. Add, near the top of `run_pipeline` (after it has `user_id`), a resolution of the language name. First read the file to find where stage prompts are built; then introduce a module-level helper and a `lang_directive` string.

Add this import + helper at module scope (top of pipeline.py, after existing imports):
```python
from vaathiyaar.modelfile import LANG_NAMES


def _lang_directive(user_id):
    """Returns an authoring-language directive for generation prompts, or '' for English."""
    try:
        prof = get_student_profile(user_id) or {}
        code = (prof.get("preferred_language") or "en")
        if code in ("en", "tanglish") or code not in LANG_NAMES:
            return ""
        name = LANG_NAMES[code]
        return (
            f"\n\nIMPORTANT: Write ALL learner-facing text (titles, descriptions, narrative, "
            f"story, hints, feedback, explanations) ENTIRELY in {name} using its native script. "
            f"Keep code, code comments, and identifiers in English. Keep the exact same JSON "
            f"structure and keys.\n"
        )
    except Exception:
        return ""
```
(If `get_student_profile` is not already imported at module scope in pipeline.py, it is — confirm via the existing `from vaathiyaar.profiler import get_student_profile`.)

- [ ] **Step 2: Inject the directive into each generation stage's prompt**

In `run_pipeline`, compute `directive = _lang_directive(user_id)` once. Then for each stage function call that builds a `prompt`/`ai_prompt`/`visual_prompt` and passes it to `call_vaathiyaar(user_message=...)`, append the directive to the prompt string. The simplest robust approach: have `run_pipeline` pass `directive` down to the stage helpers and have each stage do `user_message=prompt + directive`. Read the stage functions (`generate_outline`/`generate_narrative`/`generate_animations`/`generate_challenges` or however they're named) and append `directive` to the user_message in each `call_vaathiyaar(...)` invocation. For text/narrative/challenge stages append the directive; the animation-structure stage may also benefit (its text props are learner-facing) — append there too.

Concretely, change each `call_vaathiyaar(user_message=prompt, ...)` to `call_vaathiyaar(user_message=prompt + directive, ...)` where `directive` is the resolved string threaded into that function (add a `directive=""` parameter to each stage helper and pass it from `run_pipeline`).

- [ ] **Step 3: Verify** — `python -m py_compile backend/modules/pipeline.py` → exit 0. Confirm `directive` is threaded into every `call_vaathiyaar` user_message in the text-generating stages.

- [ ] **Step 4: Commit**
```bash
git add backend/modules/pipeline.py
git commit -m "feat(i18n): generation pipeline authors lessons in the user's language"
```

---

## Task LS-3: ProfileContext — `language` + `setLanguage`

**Files:** Modify `frontend/src/context/ProfileContext.jsx`

- [ ] **Step 1: Add the import + state + setter**

Replace the file body's provider with one exposing `language`/`setLanguage`. The current file imports `api`, `useAuth`, has `profile`/`loading`/`fetchProfile`/`refreshProfile`. Update to:
```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { updateProfileSettings } from '../api';

const ProfileContext = createContext();

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguageState] = useState(() => {
    try { return localStorage.getItem('pm_language') || 'en'; } catch { return 'en'; }
  });

  const fetchProfile = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/profile/${user.id}`);
      setProfile(res.data);
      const lang = res.data?.preferred_language;
      if (lang) {
        setLanguageState(lang);
        try { localStorage.setItem('pm_language', lang); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setLanguage = (code) => {
    if (!code) return;
    setLanguageState(code);
    try { localStorage.setItem('pm_language', code); } catch { /* ignore */ }
    if (user?.id) {
      updateProfileSettings(user.id, { preferred_language: code }).catch(() => { /* best-effort */ });
    }
    setProfile((p) => (p ? { ...p, preferred_language: code } : p));
  };

  const refreshProfile = () => fetchProfile();

  return (
    <ProfileContext.Provider value={{ profile, loading, refreshProfile, language, setLanguage }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
```
(Note: `updateProfileSettings` already exists in `../api`. Confirm its signature is `(userId, settings)`.)

- [ ] **Step 2: Verify** — from `frontend/`: `npx eslint src/context/ProfileContext.jsx` → no new errors.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/context/ProfileContext.jsx
git commit -m "feat(i18n): ProfileContext exposes language + setLanguage (persisted)"
```

---

## Task LS-4: Settings switcher + Classroom uses context language + selector restyle

**Files:** Modify `frontend/src/pages/Profile.jsx`, `frontend/src/components/LanguageSelector.jsx`, `frontend/src/pages/Classroom.jsx`

- [ ] **Step 1: Add a Language control to Profile/Settings**

Read `Profile.jsx`. In its settings area, add a labeled "Language" row that uses the selector and context. Add imports `import LanguageSelector from '../components/LanguageSelector';` and `import { useProfile } from '../context/ProfileContext';` (if not present). Inside the component, get `const { language, setLanguage } = useProfile();` and render, in the settings/preferences section:
```jsx
<div className="flex items-center justify-between gap-3 py-3 border-b border-border-default">
  <div>
    <div className="text-sm font-semibold text-text-primary">Language</div>
    <div className="text-xs text-text-muted">Vaathiyaar and lessons appear in this language.</div>
  </div>
  <LanguageSelector currentLanguage={language} onSelect={setLanguage} />
</div>
```
Place it consistently with the page's existing settings rows (match surrounding markup/spacing).

- [ ] **Step 2: Restyle LanguageSelector to theme tokens**

In `LanguageSelector.jsx`, replace dark-only utility classes so it works in light + dark:
- Trigger button: `bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white` → `bg-bg-surface border-border-default text-text-secondary hover:bg-bg-elevated hover:border-border-strong hover:text-text-primary`.
- Dropdown container: `panel border border-white/10` → `bg-bg-surface border border-border-default`.
- Header text `text-slate-500` → `text-text-muted`; close button `text-slate-500 hover:text-white` → `text-text-muted hover:text-text-primary`.
- Option rows: inactive `text-slate-300 hover:bg-white/5 hover:text-white` → `text-text-secondary hover:bg-bg-elevated hover:text-text-primary`; keep active cyan styling.
Keep all behavior, a11y roles, the language list, and the blocked-language section intact (its red styling can stay).

- [ ] **Step 3: Point Classroom's language at the context**

In `Classroom.jsx`, the `language` is currently derived as `profile?.preferred_language || user?.preferred_language || 'en'` (~line 866). Change it to use the context value: `const { language } = useProfile();` (import `useProfile` if needed) and remove the local derivation, OR keep a fallback: `const { language: ctxLanguage } = useProfile(); const language = ctxLanguage || profile?.preferred_language || 'en';`. Ensure `resolveText(..., language)` calls still receive this value. Do not change `resolveText`.

- [ ] **Step 4: Verify** — from `frontend/`: `npx eslint src/pages/Profile.jsx src/components/LanguageSelector.jsx src/pages/Classroom.jsx` → no new errors. Then `npm run build` → `✓ built`.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/Profile.jsx frontend/src/components/LanguageSelector.jsx frontend/src/pages/Classroom.jsx
git commit -m "feat(i18n): Settings language switcher + themed selector + Classroom uses context"
```

---

## Task LS-5: Offline batch lesson translator

**Files:** Create `backend/i18n/translate_lessons.py` (and `backend/i18n/__init__.py` if the package doesn't import without it — a bare script doesn't need it, but create an empty `__init__.py` for cleanliness)

- [ ] **Step 1: Create the tool**

Create `backend/i18n/translate_lessons.py`:
```python
"""
translate_lessons.py — offline batch translator for PyMasters lesson content.

Fills missing languages in EXISTING locale-maps ({"en": "..."}) inside lesson
JSONs, using a LOCAL Ollama model. Because it only ever fills locale-maps, it
can never touch code (code lives in plain-string fields, not locale-maps).

Usage (dry-run by default):
  python backend/i18n/translate_lessons.py --langs ta --file backend/lessons/python_fundamentals/adv_async.json
  python backend/i18n/translate_lessons.py --langs ta,te,ml --track python_fundamentals --write

Env:
  LOCAL_OLLAMA_URL   default http://localhost:11434
  TRANSLATE_MODEL    default qwen2.5:7b
"""
import argparse
import glob
import json
import os
import re
import sys
import urllib.request

LESSONS_DIR = os.path.join(os.path.dirname(__file__), "..", "lessons")
OLLAMA_URL = os.getenv("LOCAL_OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("TRANSLATE_MODEL", "qwen2.5:7b")

LANG_NAMES = {
    "ta": "Tamil", "te": "Telugu", "ml": "Malayalam",
    "fr": "French", "es": "Spanish", "it": "Italian", "ko": "Korean",
}

_CODE_LIKE = re.compile(r"^[\s]*[\[{<]")  # heuristic only; we never translate non-locale-maps anyway


def is_locale_map(d):
    if not isinstance(d, dict) or "en" not in d:
        return False
    return all(isinstance(k, str) and 1 <= len(k) <= 3 and k.isalpha() for k in d.keys())


def translate_text(text, lang_name):
    """Call local Ollama to translate one string. Returns translated text or None."""
    if not text or not str(text).strip():
        return text
    prompt = (
        f"You are a professional translator. Translate the following coding-tutorial text "
        f"from English to {lang_name}. Preserve meaning, tone, and any markdown. Do NOT "
        f"translate code, code identifiers, or anything inside backticks or code fences — "
        f"keep those verbatim. Return ONLY the translated text, with no preamble.\n\n"
        f"TEXT:\n{text}"
    )
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.2},
    }).encode("utf-8")
    req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=body,
                                 headers={"Content-Type": "application/json"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            out = (data.get("message") or {}).get("content", "").strip()
            return out or None
        except Exception as e:
            if attempt == 1:
                print(f"    ! translate failed: {e}", file=sys.stderr)
                return None
    return None


def walk_and_fill(node, langs, stats, write):
    """Recursively find locale-maps and fill missing languages."""
    if isinstance(node, dict):
        if is_locale_map(node):
            en = node.get("en")
            if isinstance(en, str) and en.strip():
                for lg in langs:
                    if lg in node and node[lg]:
                        stats["skipped"] += 1
                        continue
                    stats["fields"] += 1
                    if write:
                        t = translate_text(en, LANG_NAMES[lg])
                        if t:
                            node[lg] = t
                            stats["written"] += 1
                        else:
                            stats["failed"] += 1
                    else:
                        preview = en[:60].replace("\n", " ")
                        print(f"    [{lg}] would translate: {preview}…")
            # locale-map values are strings; do not recurse into them
            return
        for v in node.values():
            walk_and_fill(v, langs, stats, write)
    elif isinstance(node, list):
        for v in node:
            walk_and_fill(v, langs, stats, write)


def main():
    ap = argparse.ArgumentParser(description="Offline batch translator for lesson locale-maps.")
    ap.add_argument("--langs", default=",".join(LANG_NAMES.keys()),
                    help="comma-separated target language codes (default: all)")
    ap.add_argument("--track", help="only lessons under backend/lessons/<track>/")
    ap.add_argument("--file", help="a single lesson JSON path")
    ap.add_argument("--glob", help="custom glob under lessons dir, e.g. '**/*.json'")
    ap.add_argument("--write", action="store_true", help="write changes (default: dry-run)")
    ap.add_argument("--overwrite", action="store_true", help="re-translate even if present")
    ap.add_argument("--limit", type=int, default=0, help="max lessons to process (0 = all)")
    args = ap.parse_args()

    langs = [l.strip() for l in args.langs.split(",") if l.strip() in LANG_NAMES]
    if not langs:
        print("No valid target languages.", file=sys.stderr); sys.exit(1)

    if args.file:
        files = [args.file]
    else:
        pattern = args.glob or (f"{args.track}/**/*.json" if args.track else "**/*.json")
        files = sorted(glob.glob(os.path.join(LESSONS_DIR, pattern), recursive=True))
    if args.limit:
        files = files[:args.limit]

    print(f"Engine: {MODEL} @ {OLLAMA_URL} | langs={langs} | write={args.write} | files={len(files)}")
    total = {"fields": 0, "written": 0, "skipped": 0, "failed": 0}
    for path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                doc = json.load(f)
        except Exception as e:
            print(f"  skip {path}: {e}"); continue
        stats = {"fields": 0, "written": 0, "skipped": 0, "failed": 0}
        # if overwrite, drop target langs first so they get re-translated
        if args.overwrite and args.write:
            def _strip(n):
                if isinstance(n, dict):
                    if is_locale_map(n):
                        for lg in langs:
                            n.pop(lg, None)
                        return
                    for v in n.values(): _strip(v)
                elif isinstance(n, list):
                    for v in n: _strip(v)
            _strip(doc)
        walk_and_fill(doc, langs, stats, args.write)
        if args.write and stats["written"]:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(doc, f, ensure_ascii=False, indent=2)
        print(f"  {os.path.relpath(path, LESSONS_DIR)}: "
              f"fields={stats['fields']} written={stats['written']} "
              f"skipped={stats['skipped']} failed={stats['failed']}")
        for k in total: total[k] += stats[k]
    print(f"TOTAL: {total}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create the package marker** — create empty `backend/i18n/__init__.py`.

- [ ] **Step 3: Verify (no model needed for the dry-run path's parsing)** — `python -m py_compile backend/i18n/translate_lessons.py` → exit 0. Then run a **dry-run** that does NOT call the model (dry-run prints "would translate" without hitting Ollama): `python backend/i18n/translate_lessons.py --langs ta --limit 1`. Expected: it lists a file and prints `[ta] would translate: …` lines and a TOTAL summary, with `written=0`. (If no Ollama is running, dry-run still works because it doesn't call the model.)

- [ ] **Step 4: Commit**
```bash
git add backend/i18n/translate_lessons.py backend/i18n/__init__.py
git commit -m "feat(i18n): offline local-Ollama batch lesson translator (locale-map safe)"
```

---

## Task LS-6: Live user-testing pass + deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Full build + merge + deploy**
```bash
cd frontend && npm run build   # expect ✓ built
cd .. && git checkout main && git merge feat/language-switching && git push origin main
```
Watch: `gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId') --exit-status` → `success`.

- [ ] **Step 2: Live flows (spec §7), signed in on the deployed app:**
  1. Settings → switch language (e.g. Telugu) → reload + re-login → persists.
  2. Open Classroom / ask Vaathiyaar → replies entirely in Telugu (code in English). Repeat for Tamil.
  3. LearnAnything → request a topic with language=Tamil → generated lesson narrative/title/hints in Tamil.

- [ ] **Step 3: Translator (local, user-driven — documented, not run in CI):**
  Install Ollama + `ollama pull qwen2.5:7b`; `python backend/i18n/translate_lessons.py --langs ta --file <one>` (dry-run) → review → `--write` on a few → open in-app in Tamil → localized title/story/animations render via `resolveText`, code unchanged; re-run → idempotent (no new writes).

- [ ] **Step 4:** If all pass, done. Otherwise file the specific gap and fix via the relevant task.

---

## Self-Review (completed by author)
- **Spec coverage:** modelfile generalization (LS-1) · pipeline in-language (LS-2) · ProfileContext language/setLanguage (LS-3) · Settings switcher + selector restyle + Classroom source (LS-4) · translator tool (LS-5) · live test + deploy (LS-6). All §3–§7 mapped.
- **Type/name consistency:** `LANG_NAMES` defined in modelfile (LS-1) and imported by pipeline (LS-2); translator has its own non-en `LANG_NAMES` (intentional — standalone CLI, excludes en/tanglish). `language`/`setLanguage` from `useProfile()` consistent across LS-3/LS-4. `updateProfileSettings(userId, settings)` matches api.js. `is_locale_map` consistent in translator.
- **Placeholders:** none — LS-2 step 2 instructs the implementer to thread `directive` into each real `call_vaathiyaar` site after reading the stage functions (concrete mechanism + exact edit shape given), not a TODO.
- **Risk note:** translator dry-run does not call the model (safe to verify in CI); the actual corpus translation is an offline user-run step requiring a local Ollama (prerequisite the user owns).
