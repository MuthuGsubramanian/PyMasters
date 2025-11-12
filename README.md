# PyMasters

PyMasters is a Streamlit-powered learning platform for interactive Python mastery. It ships with a modular architecture that separates the UI, services, and data layers so the app can scale from prototype to production deployments.

## Getting started

```bash
pip install -r requirements.txt
streamlit run app.py
```

Demo credentials are seeded in `data/seed/users.json` (try `jane@pymasters.net` / `pymasters`).

## Project layout

```
app.py                 # Landing page and platform shell
pages/                 # Authenticated multipage experience (dashboard, learning paths, practice, analytics, profile)
components/            # Reusable UI components (progress cards, recommendation carousel, sandbox runner)
layouts/               # Page layout orchestrators composed of components
services/              # Business logic and integration with external APIs
models/                # Pydantic models and SQLAlchemy engine scaffolding
api/                   # Lightweight API clients (sandbox execution, recommendations)
data/seed/             # Seed data for modules, lessons, exercises, users, progress
utils/                 # Helper utilities (auth, session state, caching, telemetry)
config/                # Settings and logging configuration
tests/                # Pytest suite for service layer smoke tests
```

## Extending the platform

- Swap the seed-driven services with real PostgreSQL and Redis integrations by wiring `models/db.py` into the services layer.
- Replace the local sandbox client with a network call to a secure execution environment.
- Enable social sign-in by plugging in Auth0 or Supabase Auth in `utils/auth.py` and persisting sessions with secure cookies.
- Deploy via Streamlit Community Cloud, Hugging Face Spaces, or a custom Docker container mapped to `www.pymasters.net`.

## Testing

```
pytest
```
