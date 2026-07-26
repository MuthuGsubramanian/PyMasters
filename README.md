<div align="center">

# PyMasters

**Learn Python, AI, and cloud engineering by doing — in an interactive classroom with a built-in code playground and AI tutor.**

[**pymasters.net**](https://www.pymasters.net)

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?logo=fastapi&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Google Cloud Run](https://img.shields.io/badge/Deployed_on-Cloud_Run-4285F4?logo=googlecloud&logoColor=white)
![License](https://img.shields.io/badge/License-Proprietary-red)

</div>

---

## Overview

PyMasters is a production web platform for learning Python and modern AI/cloud engineering. Instead of static tutorials, every lesson is an interactive experience: scroll-synced visualizations explain concepts step by step, code runs directly in the browser against a sandboxed execution backend, and an AI tutor (**Vaathiyaar**) answers questions in context — in the learner's own language.

The catalog spans **430+ lessons** across Python fundamentals, data structures & algorithms, web frameworks (FastAPI, Django, Flask), machine learning and deep learning, LLM/agent engineering, and multi-cloud architecture (AWS, Azure, GCP).

## Features

- **Interactive classroom** — scrollytelling lesson layout with step-synchronized visualizers, quizzes, and linkable lessons
- **Code playground** — CodeMirror editor with server-side sandboxed Python execution and on-demand package installation
- **Vaathiyaar AI tutor** — context-aware chat assistant available across the app, with graceful degradation when AI providers are unavailable
- **Challenges** — auto-graded coding challenges with progress tracking, autosave, and an archive of past challenges
- **Multilingual** — 8 supported languages with on-demand lesson translation and safe English fallback
- **Semantic search** — local embedding-based search and related-lesson recommendations (no external vector service required)
- **Accounts & organizations** — JWT authentication, social login (GitHub, LinkedIn), profiles, and institutional/organization support
- **Accessibility** — reduced-motion support, ARIA live regions, and light/dark themes

## Architecture

```
┌────────────────────┐         ┌───────────────────────────────┐
│  React 19 SPA      │  HTTPS  │  FastAPI backend              │
│  Vite · Tailwind 4 │ ──────► │  ├─ Auth (JWT + OAuth)        │
│  CodeMirror editor │         │  ├─ Lessons / Challenges API  │
└────────────────────┘         │  ├─ Sandboxed code execution  │
                               │  ├─ Vaathiyaar AI tutor       │
                               │  └─ Semantic search (ONNX)    │
                               └──────────────┬────────────────┘
                                              │
                               ┌──────────────┴────────────────┐
                               │  SQLite + Litestream          │
                               │  (replicated to Cloud Storage)│
                               └───────────────────────────────┘
```

- **Frontend**: React 19 (Vite), Tailwind CSS 4, Framer Motion/GSAP, React Router 7
- **Backend**: FastAPI (Python 3.11+), Pydantic v2, SQLite with Litestream replication
- **AI**: Ollama Cloud–backed tutor with a pluggable provider chain; fastembed (ONNX) for local semantic search
- **Runtime**: Docker image running Nginx + Uvicorn under supervisord
- **Infrastructure**: Google Cloud Run, deployed via GitHub Actions

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- An **Ollama Cloud** API key for AI features *(optional — everything else runs without it)*
- **Docker** *(optional, for the production stack)*

### Quick start (Windows)

```bash
.\start_dev.bat
```

This launches the backend API at `http://localhost:8001` and the frontend at `http://localhost:5173`.

### Manual setup

**Backend**

```bash
cd backend
cp .env.example .env          # fill in OLLAMA_API_KEY to enable AI features
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8001
```

The SQLite database is created and seeded automatically on first start. Interactive API docs are served at `http://localhost:8001/docs`.

**Frontend**

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies API calls to :8001
```

### Running tests

```bash
cd backend && python -m pytest          # backend suite
cd frontend && npm test                 # frontend suite (Vitest)
```

## Production Deployment

Run the full stack locally with Docker:

```bash
docker-compose up --build -d
```

The production deployment targets Google Cloud Run: a single container serves the built frontend through Nginx and the API through Uvicorn, with the SQLite database continuously replicated to Google Cloud Storage via Litestream. Deploys run through GitHub Actions (`.github/workflows/deploy.yml`).

## Security

- **Sandboxed code execution** — learner code runs in an isolated subprocess with import/resource restrictions, wall-clock timeouts, and (on supported platforms) a dedicated network namespace with no egress
- **Authentication** — JWT (HS256) with token-version-based session revocation; OAuth sign-in via GitHub and LinkedIn
- **Hardened runtime** — strict Content Security Policy, per-endpoint rate limiting, and least-privilege service accounts in production

## License

Copyright © 2026 PyMasters ([pymasters.net](https://www.pymasters.net)). All rights reserved.

This is proprietary software — see [LICENSE](LICENSE) for details.
