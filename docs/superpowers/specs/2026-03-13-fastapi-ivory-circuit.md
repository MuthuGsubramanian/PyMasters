# PyMasters — FastAPI + Ivory Circuit Redesign

**Date:** 2026-03-13
**Status:** Approved
**Approach:** FastAPI backend + vanilla HTML/CSS/JS frontend, Ivory Circuit design system

## Overview

Replace the Streamlit UI with a FastAPI backend serving a vanilla HTML/CSS/JS single-page application. The frontend uses hash-based routing and communicates with the backend via JSON API endpoints. All existing backend utilities (auth, db, helpers, activity, leaderboard, tutor_parser) are preserved. Deployment target: Google Cloud Run.

## Architecture

```
Browser (HTML/CSS/JS SPA)
  ├── Hash routing: #/login, #/signup, #/dashboard, #/tutor, #/studio, #/playground, #/profile
  └── fetch() → JSON API
         │
FastAPI (Python)
  ├── GET /  → serves index.html
  ├── GET /static/* → serves CSS/JS/assets
  ├── POST /api/auth/login
  ├── POST /api/auth/signup
  ├── GET  /api/auth/me
  ├── POST /api/auth/logout
  ├── PUT  /api/auth/profile
  ├── PUT  /api/auth/password
  ├── GET  /api/modules
  ├── GET  /api/progress
  ├── POST /api/progress
  ├── POST /api/tutor/chat
  ├── GET  /api/tutor/sessions
  ├── POST /api/tutor/notes
  ├── GET  /api/tutor/notes
  ├── POST /api/studio/generate
  ├── GET  /api/studio/history
  ├── POST /api/playground/run
  ├── GET  /api/activity
  ├── GET  /api/leaderboard
  └── MongoDB (or LocalJSON fallback)
```

### Session Auth

- Login returns a session token stored as an HTTP-only cookie
- Session tokens stored in MongoDB `sessions` collection
- Middleware checks cookie on protected routes, injects user into request state
- Logout clears cookie and deletes session

### Static File Serving

FastAPI serves the frontend from a `static/` directory:
- `static/index.html` — SPA shell
- `static/css/style.css` — Ivory Circuit design system
- `static/js/app.js` — Router, API client, page renderers
- `static/js/pages/` — Individual page modules

## Design System — Ivory Circuit

### Color Palette

| Token               | Value       | Usage                          |
|---------------------|-------------|--------------------------------|
| `--bg-primary`      | `#fafaf9`   | Page background                |
| `--bg-card`         | `#ffffff`   | Card surfaces                  |
| `--bg-elevated`     | `#f5f5f4`   | Inputs, hover states           |
| `--border`          | `#e7e5e4`   | Card/input borders             |
| `--border-subtle`   | `#f0eeec`   | Dividers                       |
| `--text-primary`    | `#18181b`   | Headings, values               |
| `--text-secondary`  | `#57534e`   | Labels, body text              |
| `--text-muted`      | `#a8a29e`   | Placeholders, hints            |
| `--accent`          | `#18181b`   | Primary buttons, active nav    |
| `--accent-subtle`   | `#f5f5f4`   | Hover backgrounds              |
| `--success`         | `#16a34a`   | Completed states, positive     |
| `--warning`         | `#d97706`   | In-progress states             |
| `--danger`          | `#dc2626`   | Errors, destructive actions    |

### Typography

- **Headings:** `'Inter', system-ui, sans-serif` — weight 600-700, tracking -0.03em
- **Body:** `'Inter', system-ui, sans-serif` — weight 400-500
- **Code/mono:** `'JetBrains Mono', 'Fira Code', monospace` — for code blocks, metrics, labels

### Component Patterns

- **Cards:** white bg + 1px border + border-radius: 10px, subtle shadow on hover
- **Inputs:** bg-elevated + 1px border + border-radius: 8px
- **Buttons (primary):** black bg (#18181b), white text, border-radius: 8px
- **Buttons (secondary):** white bg, 1px border, text-secondary
- **Status pills:** Rounded badges with tinted backgrounds (amber for active, green for done, gray for queued)
- **Nav:** Top horizontal, active item has font-weight 600 + bottom border

### Spacing

4px base: 4, 8, 12, 16, 20, 24, 32, 48

## Pages

### Login / Signup

Split layout — left brand panel (off-white with subtle grid), right form. Clean, minimal.

### Dashboard

1. Welcome row — greeting + progress summary
2. Metrics row — 3 cards (Total, Active, Completed)
3. Module list — cards with title, description, tags, status pill, action buttons
4. Activity feed — collapsible section with green dot timeline
5. Leaderboard — collapsible section with ranked list

### AI Tutor

1. Chat interface — messages in cards, user messages right-aligned, assistant left-aligned
2. Rich responses — tutor_parser converts markers to styled HTML (concept cards, step breakdowns, comparison tables, code blocks)
3. Save buttons on assistant messages → notes
4. Settings panel (model, temperature, tokens)
5. Recent sessions list
6. Saved notes section

### Generative Studio

1. Form — prompt textarea + task selector + model input
2. Preview — generated image/video in card
3. History — past generations list

### Code Playground

1. Split layout — editor (textarea/monospace) left, output right
2. Snippet buttons — quick-load templates
3. Run button → POST /api/playground/run → sandboxed exec
4. Output panel with success/error coloring

### Profile

1. Account details form
2. Password change form
3. Settings (HF token, preferences)
4. Danger zone — sign out

## File Structure

```
pymasters_app/
  api/
    __init__.py
    auth.py          — login, signup, logout, me, profile, password endpoints
    modules.py       — modules list, progress get/update
    tutor.py         — chat, sessions, notes endpoints
    studio.py        — generate, history endpoints
    playground.py    — run endpoint
    activity.py      — activity feed endpoint
    leaderboard.py   — leaderboard endpoint
    middleware.py     — session auth middleware
  utils/             — PRESERVED: auth.py, db.py, helpers.py, local_db.py,
                       bootstrap.py, activity.py, leaderboard.py, tutor_parser.py, secrets.py
  server.py          — FastAPI app factory, mounts static files, includes routers

static/
  index.html         — SPA shell (nav + content container)
  css/
    style.css        — Ivory Circuit design system
  js/
    app.js           — Router, API client, page loader
    pages/
      login.js
      signup.js
      dashboard.js
      tutor.js
      studio.js
      playground.js
      profile.js

app.py               — Entrypoint: uvicorn pymasters_app.server:app
```

## Data Layer

No changes to MongoDB collections. All existing collections preserved:
- users, sessions, tutor_sessions, generations, progress
- activity, notes, playground_runs, leaderboard_cache

## Deployment

- Dockerfile: Python base, install requirements, copy app, run uvicorn
- cloudbuild.yaml: build and deploy to Cloud Run
- Requirements: add `fastapi`, `uvicorn[standard]`, remove `streamlit`
