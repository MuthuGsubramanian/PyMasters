# Effective Language Switching (AI & Learning Content)

**Date:** 2026-06-08
**Status:** Design — approved, proceeding to plan + build
**Surface:** `frontend/src/context/ProfileContext.jsx` + Profile/Settings UI + `LanguageSelector` · `backend/vaathiyaar/modelfile.py` · `backend/modules/pipeline.py` · new `backend/i18n/translate_lessons.py`

---

## 1. Goal & Context

Make language switching **effective** for learners: when a user picks a language, the **AI tutor (Vaathiyaar) and learning content** are delivered in that language. The static UI chrome stays English (out of scope). This is request #1 of the user's three asks.

### Current state (verified)
- `preferred_language` is stored per user and already drives **lesson content** rendering: `Classroom`/`AnimationRenderer` use `resolveText(content, language)` → `content[lang] || content.en`, where lesson text lives in **locale-maps** (`{"en": ...}`).
- `build_system_prompt` (modelfile.py) already reads `profile["preferred_language"]` but its `CRITICAL LANGUAGE RULE` only special-cases **`ta`, `tanglish`, `en`** — the other supported languages (`te, ml, fr, es, it, ko`) silently fall through to English.
- `SUPPORTED_LANGUAGES` lists 8 (en, ta, te, ml, fr, es, it, ko); only `en.json`+`ta.json` UI dicts exist (irrelevant here since UI chrome is out of scope).
- Pre-built lessons are mostly `en`-only locale-maps.
- `ProfileContext` is minimal (`{profile, loading, refreshProfile}`); there's no central `language` setter. `LanguageSelector` appears in Onboarding; the Settings/Profile control is thin and dark-only styled.

### Decisions locked during brainstorming
- **Scope:** switching changes the **AI learning experience** (Vaathiyaar chat/teaching + generated lessons) and **lesson content**; UI chrome stays English.
- **Pre-built lessons:** **batch pre-translated offline** into locale-maps baked into the JSON (served at zero runtime cost by `resolveText`).
- **Batch engine:** a **local Ollama** install with a strong multilingual model (e.g. `qwen2.5:7b`), configurable endpoint/model; CPU-only one-time overnight run. (No local model exists yet — installing it is a prerequisite the user owns.)
- **Approach A:** `ProfileContext` is the single source of `language`; the **backend resolves `preferred_language` server-side** for AI (authoritative); the translator only fills **existing locale-maps** (cannot touch code).

### Out of scope
- UI-chrome localization (menus/buttons/labels), full `t()` wiring, translation files for chrome.
- On-the-fly runtime translation (we pre-translate offline instead).

---

## 2. Architecture Overview

```
ProfileContext  ──language, setLanguage──> LanguageSelector (Settings/Profile)
   │  setLanguage(code): update context + updateProfileSettings(preferred_language) + localStorage
   └─ language consumed by Classroom/AnimationRenderer (resolveText) [already wired]

Vaathiyaar (server-authoritative language):
   classroom chat/evaluate ─> build_system_prompt(profile, ctx)  [generalize lang rule to all 8 langs]
   generation pipeline (run_pipeline) ─> inject "author in {LanguageName}" via user's preferred_language

Offline tool:  backend/i18n/translate_lessons.py
   local Ollama ─> walk lesson JSONs ─> fill missing locale-map languages (en -> ta/te/ml/fr/es/it/ko)
   resolveText then serves them at runtime (zero cost)
```

No new runtime infra. The translator is an offline CLI.

---

## 3. Frontend — language source of truth + Settings switcher

### 3.1 `ProfileContext` gains `language` + `setLanguage`
- Derive `language` from `profile?.preferred_language`, falling back to `localStorage('pm_language')`, then `'en'`.
- `setLanguage(code)`: (1) optimistic local state + `localStorage` write; (2) best-effort `updateProfileSettings(user.id, { preferred_language: code })`; (3) `refreshProfile()`.
- Export `{ profile, loading, refreshProfile, language, setLanguage }`.
- `language` available app-wide; mirror to `localStorage` so it's correct on first paint before the profile loads.

### 3.2 Settings/Profile control
- Add a labeled **"Language"** row to the Profile/Settings page using `LanguageSelector`, wired `currentLanguage={language}` / `onSelect={setLanguage}`.
- Restyle `LanguageSelector` to theme tokens (`bg-bg-surface`/`text-text-*`/`border-border-default` instead of `bg-white/5 text-slate-300`) so it reads correctly in light + dark; keep its dropdown a11y, the 8 supported languages, and the blocked-`hi` behavior.

### 3.3 Consumers
- `Classroom`'s `language` source becomes the context `language` (single source) rather than the scattered `profile?.preferred_language || user?.preferred_language || ...` chain. `resolveText`/`AnimationRenderer` are unchanged.

---

## 4. Backend — Vaathiyaar in the selected language (authoritative)

### 4.1 Generalize the language rule (`backend/vaathiyaar/modelfile.py`)
- Extend the `lang_label` map to all supported codes:
  `{en:English, ta:Tamil, te:Telugu, ml:Malayalam, fr:French, es:Spanish, it:Italian, ko:Korean, tanglish:"Tanglish (Tamil + English mix)"}`.
- Replace the `if ta / elif tanglish / else English` block so that for **any supported non-English, non-tanglish language X**, the rule is: *"CRITICAL LANGUAGE RULE: You MUST respond ENTIRELY in {LanguageName} (native script). Every word of the 'message' field must be in {LanguageName}. Keep Python keywords, code, identifiers, and all JSON keys/non-message values in English. This is non-negotiable."* Keep the existing `ta` (Tamil-script), `tanglish`, and `en` cases (the general rule subsumes `ta`; keep its explicit Tamil-script wording).
- Source of truth stays `profile["preferred_language"]` (already loaded by `get_student_profile` from the DB), so the switcher's DB write makes chat authoritative without trusting the client. The route may still pass `request.language` as an override into `lesson_context`, but the profile value is the default.

### 4.2 Generated lessons in-language (`backend/modules/pipeline.py`)
- `run_pipeline(job_id, user_id, topic)` resolves the user's `preferred_language` (via `get_student_profile(user_id)` or a direct DB read) → `LanguageName`.
- Prepend a directive to each stage's `prompt`/`user_message` passed to `call_vaathiyaar`: *"Write ALL learner-facing narrative, explanations, titles, descriptions, hints, and feedback in {LanguageName}. Keep code, code comments-in-code, and identifiers in English. Output the same JSON structure."* (For `en`, omit the directive.)
- Result: generated lesson fields are authored in the chosen language. Stored as today; `resolveText` shows them (the active language is the generated one with `en` fallback for any field left English).
- A shared `LANG_NAMES` constant (code→English name) lives in one module (e.g. add to `modelfile.py` and import in pipeline) — single source, no duplication.

---

## 5. Backend — offline batch lesson translator

### 5.1 `backend/i18n/translate_lessons.py` (new CLI tool)
- **Config** (env + CLI flags): `LOCAL_OLLAMA_URL` (default `http://localhost:11434`), `TRANSLATE_MODEL` (default `qwen2.5:7b`), `--langs ta,te,ml,...` (default all supported non-en), `--track`/`--glob`/`--file` to scope lessons, `--write` (default **dry-run**), `--overwrite` (re-translate existing), `--limit N`.
- **Walk:** load each lesson JSON under `backend/lessons/**`; recursively find **locale-map dicts** — a `dict` whose keys are all short language codes (≤3 chars, alphabetic) and that contains `"en"`. For each such map and each target language not already present, translate the `en` string via local Ollama and add the key.
- **Translation call:** POST to `{LOCAL_OLLAMA_URL}/api/chat` (or `/api/generate`) with the configured model; prompt: *"You are a professional translator. Translate the following coding-tutorial text from English to {LanguageName}. Preserve meaning, tone, and any markdown. Do NOT translate code, code identifiers, or anything inside backticks or code fences — keep those verbatim. Return ONLY the translated text, no preamble."* One field per call; retry once on failure; on persistent failure, skip that field (leave `en` only) and log it.
- **Safety by construction:** only existing locale-maps are filled. Code lives in plain-string fields (`practice_challenges[*].starter_code` etc.), never locale-maps, so it is never sent to the translator.
- **Idempotent:** a language already present in a map is skipped unless `--overwrite`.
- **Output:** write UTF-8 JSON (`ensure_ascii=False`, indent=2) preserving key order; print a per-lesson summary (maps found, fields translated, skipped) and a final tally. Dry-run prints what *would* be translated without writing.

### 5.2 Runbook (documented in the tool's `--help`/docstring + plan)
1. Install Ollama locally; `ollama pull qwen2.5:7b`; ensure `ollama serve` is running on `:11434`.
2. Dry-run a couple of lessons: `python backend/i18n/translate_lessons.py --langs ta --file <one_lesson.json>`.
3. Review the printed translations; then `--write` for one language on a small set; open those lessons in the app to verify.
4. Run per language (overnight) for the desired corpus; commit the updated lesson JSONs.

---

## 6. Error Handling & Edge Cases
- Switcher: `setLanguage` is optimistic; if the DB write fails, the local/`localStorage` value still applies (best-effort), and a later profile refresh reconciles.
- Blocked language (`hi`) keeps its existing "not supported" UX.
- AI: if `preferred_language` is missing/unknown, default to English (existing behavior).
- Generated lessons: if the model ignores the language directive for some field, `resolveText` still renders whatever is present (en fallback) — no crash.
- Translator: never writes a locale-map where none existed; on model/connection error, leaves the field English and logs; re-runnable to fill gaps. Large lessons are translated field-by-field (no giant single prompt).
- Translator must handle non-ASCII safely (UTF-8 read/write, `ensure_ascii=False`).

---

## 7. Verification — Live User Testing
1. **Switcher persistence:** change language in Settings → reload and re-login → it stays; `Classroom` content reflects the language.
2. **Vaathiyaar in-language:** with language = Telugu (and separately Tamil), open Classroom/ask Vaathiyaar → replies come back **entirely in that language**, code in English.
3. **Generated lesson in-language:** request a new topic via LearnAnything with language = (e.g.) Tamil → the generated lesson's narrative/title/hints are in Tamil.
4. **Translator dry-run:** run on 1–2 lessons for `ta` → inspect printed translations for fidelity; confirm code/backtick content untouched.
5. **Translator write + render:** `--write` `ta` on a few lessons → open them in-app in Tamil → localized title/description/story/animation text render via `resolveText`; code unchanged.
6. **Idempotency:** re-run the translator → already-translated languages skipped, no duplicate keys, no diff.
7. **Quality spot-check:** user reviews ta/te/ml output quality.

**Done when:** the switcher persists and drives Vaathiyaar + generated lessons in-language live, and the translator safely fills locale-maps that render correctly in-app (verified on a sample), idempotently.

---

## 8. Implementation Order (for the plan)
1. `modelfile.py`: `LANG_NAMES` constant + generalize the language rule to all supported languages.
2. `pipeline.py`: resolve user's `preferred_language` and inject the authoring-language directive into generation stages.
3. `ProfileContext`: add `language` + `setLanguage` (context + DB + localStorage).
4. Settings/Profile: add the `LanguageSelector` control (theme-token restyle); point `Classroom`'s language at the context.
5. `backend/i18n/translate_lessons.py`: the locale-map-walking local-Ollama translator (dry-run default, idempotent, safe).
6. Live user-testing pass (§7); (translator corpus run is operational, user-driven, after install).
