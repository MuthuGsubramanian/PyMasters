# PyMasters UI Redesign — Obsidian Terminal

**Date:** 2026-03-13
**Status:** Approved
**Approach:** Phased rollout within Streamlit (custom HTML/CSS/JS components)

## Overview

Replace the current Streamlit UI with a sleek, minimalistic, futuristic "Obsidian Terminal" aesthetic. Deep black backgrounds, green accents, monospace typography, and precision-engineered components. Stay within Streamlit using `st.markdown(unsafe_allow_html=True)` and `st.components.v1.html()` for custom rendering.

Copy tone: light personality, functional warmth. No marketing fluff — short, warm, informative.

## Design System

### Color Palette

| Token               | Value                       | Usage                          |
|---------------------|-----------------------------|--------------------------------|
| `--bg-primary`      | `#09090b`                   | Page background                |
| `--bg-card`         | `#0a0a0a`                   | Card surfaces                  |
| `--bg-elevated`     | `#18181b`                   | Inputs, hover states           |
| `--border`          | `#27272a`                   | Card/input borders             |
| `--border-subtle`   | `#1c1c1e`                   | Dividers, grid lines           |
| `--text-primary`    | `#fafafa`                   | Headings, values               |
| `--text-secondary`  | `#a1a1aa`                   | Labels, body text              |
| `--text-muted`      | `#52525b`                   | Placeholders, hints            |
| `--accent`          | `#22c55e`                   | Active states, CTAs, progress  |
| `--accent-glow`     | `rgba(34,197,94,0.15)`      | Subtle glows, hover backgrounds|
| `--danger`          | `#ef4444`                   | Errors, destructive actions    |
| `--warning`         | `#eab308`                   | In-progress states             |

### Typography

- **Headings:** `'JetBrains Mono', 'Fira Code', monospace` — weight 600-700
- **Body:** `'Inter', system-ui, sans-serif` — weight 400-500
- **Labels/badges:** `'JetBrains Mono'` — size 10-11px, uppercase, letter-spacing 0.08-0.15em

### Component Patterns

- **Cards:** `bg-card` + 1px `border` + `border-radius: 10px` — no heavy shadows, no glassmorphism
- **Inputs:** `bg-elevated` + 1px `border` + `border-radius: 6px`
- **Buttons (primary):** `accent` background, `#09090b` text, `border-radius: 6px`
- **Buttons (secondary):** `bg-elevated` + 1px `border`, `text-secondary`
- **Status pills:** Small rounded badges with subtle tinted backgrounds
- **Grid background:** Repeating 32px lines at `border-subtle` opacity, used on hero sections only

### Spacing Scale

4px base: 4, 8, 12, 16, 20, 24, 32, 48

## Navigation

### Structure

Tab-style navigation at the top of the content area. No header bar, no sidebar, no logo in nav.

Implemented via `st.radio(horizontal=True)` with heavy CSS restyling:
- Tabs: monospace, uppercase, 11px, letter-spacing 0.12em
- Active tab: green underline (`accent`) + `text-primary`
- Inactive tabs: `text-muted`, no underline
- 1px `border-subtle` line separates tab row from content

### Tab Sets

- **Public:** `SIGN IN` · `SIGN UP`
- **Authenticated:** `DASHBOARD` · `TUTOR` · `STUDIO` · `PLAYGROUND` · `PROFILE` (sign-out is located in Profile → Danger zone, not in the tab bar)

### Feature Grouping (to keep tab bar trimmed)

- Activity Feed → collapsible section in Dashboard
- Notes/Bookmarks → section within Tutor page
- Leaderboard → section within Dashboard
- Settings → sub-section within Profile page

### Page-Level Pattern

```
[Tab Nav - 1px border bottom]
[16px gap]
[Page title + subtitle - left aligned]
[24px gap]
[Content area]
```

## Pages

### Login (Split Layout)

Two Streamlit columns `[0.45, 0.55]`:

**Left column (Brand):**
- Subtle grid background overlay
- Small green dot + "PYMASTERS" monospace uppercase label
- Tagline: "Learn Python. Build things. Ship fast." — `text-primary`, 20px, weight 600
- Two chips at bottom: `3 modules` · `AI tutor` — `bg-elevated` with `border`

**Right column (Form):**
- "Sign in" heading + "Welcome back" subtitle
- `st.form()`: User ID/email input, Password input, Submit ("Sign in")
- Below form: "New here? **Sign up**" link text

### Signup (Split Layout)

Same structure as Login:
- Left: Brand panel, tagline "Create your account. Start building."
- Right: `st.form()` with Full name, User ID, Email (opt), Phone (opt), Password, Confirm, Submit
- Below form: "Have an account? **Sign in**"

### Dashboard

1. **Welcome row** — "Welcome back, {name}." 22px monospace + subtitle with progress summary
2. **Metrics row** — 3 cards in `st.columns([1,1,1])`:
   - Total Modules (text-primary number)
   - In Progress (warning-colored number)
   - Completed (accent-colored number)
   - Each: `bg-card` + `border`, large monospace number, uppercase muted label
3. **Modules list** — "Your modules" heading, each module as a `bg-card` row:
   - Title + description + tag pills (accent-glow bg, accent text)
   - Right: difficulty, time estimate, status pill (Queued/In progress/Completed)
   - Action buttons: Start · Complete · Reset (secondary style)
4. **Leaderboard** — `st.expander("Leaderboard")`: ranked list, current user highlighted
5. **Activity feed** — `st.expander("Recent activity")`: chronological event list with green dots

### AI Tutor (Terminal Style)

1. **Header** — "AI Tutor" + subtitle, settings in expander
2. **Chat area** — Terminal-style container:
   - `bg-card` + `border` + 10px radius
   - Top bar: three dots (red/yellow/green, 8px) + "pymasters-tutor" monospace label
   - User messages: `>` prefix in accent, monospace
   - Assistant messages: rich visual content (see below)
3. **Input** — `st.chat_input()` restyled dark
4. **Notes** — `st.expander("Saved notes")`: bookmarked responses with save buttons

**Rich Visual Responses:**
The system prompt instructs the model to use structured markers. A post-processing function converts them to styled HTML:
- **Code blocks** — Green-tinted monospace in `bg-elevated`, copy button
- **Diagrams** — Mermaid-style markup rendered as styled HTML boxes + arrows
- **Concept cards** — `bg-elevated` cards with green left border, term + explanation
- **Step-by-step breakdowns** — Vertical timeline with green dots, each step in a mini-card
- **Comparison tables** — Dark table with `border-subtle` dividers
- **Visual memory models** — Colored box diagrams for stack/heap, variable references

Uses HuggingFace Inference API for text generation with visual content markers.

### Generative Studio (Card-Based)

1. **Header** — "Studio" + subtitle
2. **Generation form** — `bg-card` container, `st.form()` with `[0.65, 0.35]` columns:
   - Left: Prompt text area
   - Right: Task selector (Image/Video), Model input
   - "Generate" button in accent green
3. **Preview** — `bg-card` container with generated image/video, model name, prompt echo, timestamp
4. **History** — `st.expander("History")`: past generations with task type, prompt, timestamp

### Code Playground

1. **Header** — "Playground" + subtitle
2. **Editor area** — Two columns `[0.55, 0.45]`:
   - **Left: Code editor** — `st.components.v1.html()` with a lightweight JS editor (CodeMirror) for syntax highlighting and tab support. Fallback to `st.text_area()` restyled monospace. "Run ▶" button in accent
   - **Right: Output** — Terminal-style panel with fake dots, stdout/stderr display
3. **Snippets bar** — Quick-load buttons: Hello World · List Ops · Dictionary · API Call

### Profile & Settings

1. **Profile section** — Two columns `[0.55, 0.45]`:
   - Left: Profile form (name, user ID, email, phone) in `bg-card`
   - Right: Password change form in `bg-card`
   - Danger zone below: `bg-card` with `--danger` left border, sign-out button
2. **Settings** — `st.expander("Settings")`:
   - Theme toggle (non-functional UI stub — future light mode, no theme engine needed now)
   - API Keys: HF token field (masked)
   - Notifications: checkbox preferences (non-functional UI stub — wired up in Phase 4)

## Data Layer

### New MongoDB Collections

| Collection         | Fields                                                                                          | Purpose                    |
|--------------------|-------------------------------------------------------------------------------------------------|----------------------------|
| `notes`            | `user_id`, `source` ("tutor"/"playground"), `content`, `snippet_preview`, `created_at`         | Saved responses & snippets |
| `activity`         | `user_id`, `action`, `detail`, `created_at`                                                    | Activity feed events       |
| `playground_runs`  | `user_id`, `code`, `output`, `status` ("success"/"error"), `created_at`                        | Playground execution history|
| `leaderboard_cache`| `user_id`, `username`, `completed_count`, `last_updated`                                       | Aggregated leaderboard     |

### Activity Actions

`started_module`, `completed_module`, `tutor_session`, `generation`, `playground_run`

### Activity Logging

A `log_activity(db, user_id, action, detail)` helper called at key moments. One-liner insert in existing view functions — no separate service.

### Existing Collections

No changes to: `users`, `sessions`, `learning_modules`, `progress`, `tutor_sessions`, `generations`.

## Phased Rollout

| Phase     | Scope                                                                               | Complexity |
|-----------|-------------------------------------------------------------------------------------|------------|
| **Phase 1** | Login, Signup, Dashboard, Tutor (with rich visuals), Studio, Profile — full Obsidian Terminal reskin + tab nav | Core       |
| **Phase 2** | Activity Feed (Dashboard section) + Settings (Profile section) + `activity` collection + `log_activity` helper | Low        |
| **Phase 3** | Code Playground page + Notes/Bookmarks (Tutor section) + `notes` + `playground_runs` collections              | Medium     |
| **Phase 4** | Leaderboard (Dashboard section) + `leaderboard_cache` + community data aggregation                            | Social     |

## Technical Constraints

- All UI via Streamlit — `st.markdown(unsafe_allow_html=True)` for custom HTML/CSS, `st.components.v1.html()` for interactive components
- Streamlit's native widgets (`st.form`, `st.chat_input`, `st.radio`, `st.text_input`, etc.) restyled via CSS injection
- Sidebar hidden via CSS
- HuggingFace Inference API for AI Tutor and Studio (token stored in `.env`, gitignored)
- MongoDB for all persistence (with existing local JSON fallback)
