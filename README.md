# PyMasters

PyMasters is a Streamlit-powered learning platform for interactive Python mastery. The refreshed application ships with a modular architecture, MongoDB-backed persistence, and an authentication flow that mirrors a production SaaS experience.

## Getting started

```bash
cp .env.example .env  # update credentials if needed
pip install -r requirements.txt
streamlit run pymasters_app/main.py
```

The platform seeds a default super admin account on first launch:

- **Email:** `muthu.g.subramanian`
- **Password:** `Password@123`

## Project layout

```
pymasters_app/
  main.py              # Streamlit entrypoint with navigation + layout
  components/          # Header + sidebar UI components
  pages/               # Login, signup, dashboard, and profile views
  utils/               # MongoDB + authentication helpers
data/seed/             # Seed data for learning modules and demo content
```

## Extending the platform

- Add learning streak analytics and cohort reporting by expanding the `progress` collection schema.
- Integrate interactive code execution by adapting the sandbox client in `components/code_runner.py`.
- Wire optional role-based access control rules through the `users` collection.
- Deploy via Streamlit Community Cloud, Hugging Face Spaces, or a custom Docker image mapped to your preferred domain.

## Testing

```
pytest
```
