# Obsidian Terminal Phase 1 — Core Reskin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current PyMasters Streamlit UI with the Obsidian Terminal design system — deep black, green accents, monospace typography, tab navigation — across all 6 existing views.

**Architecture:** Stay within Streamlit. Inject a global CSS design system via `st.markdown(unsafe_allow_html=True)`. Restyle all native Streamlit widgets (forms, inputs, buttons, radio, chat) via CSS overrides. Each view file is rewritten to use the new design tokens and layout patterns. The header component is replaced with a minimal tab nav. A tutor response parser converts structured markers to rich visual HTML.

**Tech Stack:** Streamlit, Python 3.11, MongoDB (pymongo), HuggingFace Inference API, CSS custom properties, Google Fonts (JetBrains Mono, Inter)

**Spec:** `docs/superpowers/specs/2026-03-13-obsidian-terminal-redesign.md`

---

## File Structure

### Files to Create
- `pymasters_app/styles.py` — Global CSS design system (all tokens, widget overrides, grid background)
- `pymasters_app/components/tab_nav.py` — Tab navigation component (replaces `header.py`)
- `pymasters_app/utils/tutor_parser.py` — Parses tutor response markers into styled HTML

### Files to Modify
- `pymasters_app/main.py` — Replace header with tab nav, swap global styles, update page routing
- `pymasters_app/views/login.py` — Obsidian Terminal reskin with split layout
- `pymasters_app/views/signup.py` — Obsidian Terminal reskin with split layout
- `pymasters_app/views/dashboard.py` — Obsidian Terminal reskin with metrics and module cards
- `pymasters_app/views/tutor.py` — Terminal-style chat with rich visual responses
- `pymasters_app/views/studio.py` — Card-based Obsidian Terminal reskin
- `pymasters_app/views/profile.py` — Obsidian Terminal reskin with settings stub

### Files Unchanged
- `pymasters_app/utils/auth.py` — No changes needed
- `pymasters_app/utils/db.py` — No changes needed
- `pymasters_app/utils/bootstrap.py` — No changes needed (new collections are Phase 2+)
- `pymasters_app/utils/helpers.py` — No changes needed
- `pymasters_app/utils/secrets.py` — No changes needed
- `services/huggingface_service.py` — No changes needed
- `config/settings.py` — No changes needed

---

## Chunk 1: Design System + Navigation

### Task 1: Create global CSS design system

**Files:**
- Create: `pymasters_app/styles.py`

- [ ] **Step 1: Create `pymasters_app/styles.py` with the full Obsidian Terminal CSS**

```python
"""Obsidian Terminal design system — global CSS for PyMasters."""

OBSIDIAN_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root {
    --bg-primary: #09090b;
    --bg-card: #0a0a0a;
    --bg-elevated: #18181b;
    --border: #27272a;
    --border-subtle: #1c1c1e;
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --accent: #22c55e;
    --accent-glow: rgba(34,197,94,0.15);
    --danger: #ef4444;
    --warning: #eab308;
}

/* === Base === */
[data-testid="stSidebar"] { display: none; }
body { background-color: var(--bg-primary); }
.stApp {
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-family: 'Inter', system-ui, sans-serif;
}
.block-container {
    padding-top: 1rem;
    max-width: 1100px;
}

/* === Typography === */
h1, h2, h3, h4 {
    color: var(--text-primary);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    letter-spacing: -0.01em;
    font-weight: 600;
}
p, label, span, div { color: var(--text-secondary); }

/* === Cards === */
.ob-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
}

/* === Inputs === */
.stForm input, .stForm textarea, .stTextInput input, .stTextArea textarea {
    background: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: 6px !important;
    color: var(--text-primary) !important;
    font-family: 'Inter', system-ui, sans-serif !important;
}
.stForm input::placeholder, .stTextInput input::placeholder {
    color: var(--text-muted) !important;
}
.stForm label, .stTextInput label {
    color: var(--text-secondary) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 11px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    font-weight: 500 !important;
}

/* === Buttons === */
.stButton > button {
    background: var(--accent) !important;
    color: var(--bg-primary) !important;
    border: none !important;
    border-radius: 6px !important;
    font-weight: 600 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 12px !important;
    letter-spacing: 0.04em !important;
    text-transform: uppercase !important;
    transition: opacity 0.15s ease !important;
}
.stButton > button:hover {
    opacity: 0.85 !important;
    transform: none !important;
    box-shadow: none !important;
}

/* === Secondary buttons === */
.ob-btn-secondary .stButton > button {
    background: var(--bg-elevated) !important;
    color: var(--text-secondary) !important;
    border: 1px solid var(--border) !important;
}
.ob-btn-secondary .stButton > button:hover {
    border-color: var(--accent) !important;
    color: var(--text-primary) !important;
}

/* === Forms === */
.stForm {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
    padding: 24px !important;
    box-shadow: none !important;
}

/* === Metrics === */
.stMetric {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 20px;
    box-shadow: none;
}
.stMetric label { color: var(--text-muted) !important; }
.stMetric [data-testid="stMetricValue"] {
    color: var(--text-primary) !important;
    font-family: 'JetBrains Mono', monospace !important;
}

/* === Expanders === */
.streamlit-expanderHeader {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
    color: var(--text-secondary) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 12px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
}
.streamlit-expanderContent {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-top: none !important;
    border-radius: 0 0 10px 10px !important;
}

/* === Chat === */
.stChatMessage {
    background: transparent !important;
    border: none !important;
    padding: 8px 0 !important;
}
.stChatInputContainer {
    background: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: 6px !important;
}
.stChatInputContainer textarea {
    color: var(--text-primary) !important;
}

/* === Tab Nav (radio override) === */
.ob-tab-nav [role="radiogroup"] {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 0;
}
.ob-tab-nav label {
    cursor: pointer;
    margin-bottom: 0 !important;
}
.ob-tab-nav label span {
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 11px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.12em !important;
    color: var(--text-muted) !important;
    padding: 8px 16px !important;
    border-radius: 0 !important;
    background: transparent !important;
    border: none !important;
    border-bottom: 2px solid transparent !important;
    box-shadow: none !important;
    transition: all 0.15s ease !important;
}
.ob-tab-nav label:hover span {
    color: var(--text-secondary) !important;
}
.ob-tab-nav label input:checked + span,
.ob-tab-nav label[data-checked="true"] span {
    color: var(--text-primary) !important;
    border-bottom-color: var(--accent) !important;
    background: transparent !important;
}
.ob-tab-nav [data-testid="stWidgetLabel"] { display: none; }

/* === Status pills === */
.ob-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 99px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
}
.ob-pill-queued { background: rgba(161,161,170,0.12); color: #a1a1aa; border: 1px solid rgba(161,161,170,0.2); }
.ob-pill-progress { background: rgba(234,179,8,0.12); color: #eab308; border: 1px solid rgba(234,179,8,0.2); }
.ob-pill-completed { background: var(--accent-glow); color: var(--accent); border: 1px solid rgba(34,197,94,0.2); }

/* === Grid background === */
.ob-grid-bg {
    position: relative;
}
.ob-grid-bg::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(var(--border-subtle) 1px, transparent 1px),
        linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
    border-radius: inherit;
}

/* === Toast / alerts === */
.stAlert {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
    color: var(--text-secondary) !important;
}

/* === Divider === */
.ob-divider {
    height: 1px;
    background: var(--border-subtle);
    margin: 16px 0 24px;
}

/* === Scrollbar === */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
</style>
"""
```

- [ ] **Step 2: Verify the file was created**

Run: `python -c "from pymasters_app.styles import OBSIDIAN_CSS; print('OK:', len(OBSIDIAN_CSS), 'chars')"`
Expected: `OK: XXXX chars`

- [ ] **Step 3: Commit**

```bash
git add pymasters_app/styles.py
git commit -m "feat: add Obsidian Terminal design system CSS"
```

---

### Task 2: Create tab navigation component

**Files:**
- Create: `pymasters_app/components/tab_nav.py`

- [ ] **Step 1: Create `pymasters_app/components/tab_nav.py`**

```python
"""Minimal tab navigation for PyMasters — Obsidian Terminal style."""
from __future__ import annotations

from typing import Iterable, Optional

import streamlit as st


def render_tab_nav(
    *,
    pages: Iterable[str],
    current_page: str,
) -> Optional[str]:
    """Render tab-style navigation. Returns selected page if changed, else None."""
    page_list = list(pages)
    current_index = page_list.index(current_page) if current_page in page_list else 0

    st.markdown("<div class='ob-tab-nav'>", unsafe_allow_html=True)
    selection = st.radio(
        "Navigation",
        page_list,
        horizontal=True,
        label_visibility="collapsed",
        index=current_index,
        key="ob-nav",
    )
    st.markdown("</div>", unsafe_allow_html=True)
    st.markdown("<div class='ob-divider'></div>", unsafe_allow_html=True)

    if selection != current_page:
        return selection
    return None
```

- [ ] **Step 2: Verify import**

Run: `python -c "from pymasters_app.components.tab_nav import render_tab_nav; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add pymasters_app/components/tab_nav.py
git commit -m "feat: add tab navigation component"
```

---

### Task 3: Update main.py — swap header for tab nav and inject new styles

**Files:**
- Modify: `pymasters_app/main.py`

- [ ] **Step 1: Rewrite `pymasters_app/main.py` to use tab nav and Obsidian CSS**

Replace the entire file. Key changes:
- Import `OBSIDIAN_CSS` from `pymasters_app.styles` instead of inline CSS
- Import `render_tab_nav` from `pymasters_app.components.tab_nav` instead of `render_header`
- Remove the `render_header()` call and replace with `render_tab_nav()`
- Update page config icon and title
- Remove all inline `st.markdown` CSS blocks
- Handle "Log out" via Profile page (no longer in nav tabs)
- Add `PLAYGROUND` to private pages (placeholder for Phase 3)

```python
"""PyMasters Streamlit application entrypoint — Obsidian Terminal."""
from __future__ import annotations

import streamlit as st

from pymasters_app.styles import OBSIDIAN_CSS
from pymasters_app.components.tab_nav import render_tab_nav
from pymasters_app.views import dashboard, login, profile, signup
from pymasters_app.views import studio, tutor
from pymasters_app.utils.auth import AuthManager
from pymasters_app.utils.db import get_database
from pymasters_app.utils.bootstrap import ensure_collections


st.set_page_config(
    page_title="PyMasters",
    page_icon="▸",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(OBSIDIAN_CSS, unsafe_allow_html=True)


def _init_session_state() -> None:
    if "current_page" not in st.session_state:
        st.session_state["current_page"] = "Dashboard"


_init_session_state()


def _initialize_database_and_auth() -> tuple[object, AuthManager]:
    try:
        db = get_database()
    except Exception as exc:
        st.error("Database connection failed. Check MONGODB_URI and IP allowlist.")
        st.exception(exc)
        st.stop()

    if getattr(db, "is_local", False):
        st.info("Using local datastore — MongoDB unavailable.", icon="⚡")

    try:
        ensure_collections(db)
        auth_manager = AuthManager(db)
        auth_manager.ensure_super_admin()
    except Exception as exc:
        st.error("Failed to initialize application state.")
        st.exception(exc)
        st.stop()

    return db, auth_manager


db, auth_manager = _initialize_database_and_auth()
user = auth_manager.get_current_user()

public_pages = ("Sign in", "Sign up")
private_pages = ("Dashboard", "Tutor", "Studio", "Playground", "Profile")

if not user and st.session_state.get("current_page") not in public_pages:
    st.session_state["current_page"] = "Sign in"

nav_pages = private_pages if user else public_pages
selected_page = render_tab_nav(
    pages=nav_pages,
    current_page=st.session_state["current_page"],
)
if selected_page and selected_page != st.session_state["current_page"]:
    st.session_state["current_page"] = selected_page

user = auth_manager.get_current_user()
page = st.session_state["current_page"]

if page == "Sign in":
    login.render(auth_manager)
elif page == "Sign up":
    signup.render(auth_manager)
elif page == "Profile":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        profile.render(auth_manager=auth_manager, user=user)
elif page == "Tutor":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        tutor.render(auth_manager=auth_manager, user=user)
elif page == "Studio":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        studio.render(user=user)
elif page == "Playground":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        st.markdown("### Playground")
        st.caption("Coming soon in Phase 3.")
else:
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        dashboard.render(db=db, user=user)
```

- [ ] **Step 2: Delete the old header component**

Run: `rm pymasters_app/components/header.py`

- [ ] **Step 3: Verify app loads**

Run: `streamlit run app.py --server.headless true &` then `sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:8501`
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add pymasters_app/main.py pymasters_app/components/tab_nav.py
git rm pymasters_app/components/header.py
git commit -m "feat: replace header with tab nav, inject Obsidian Terminal CSS"
```

---

## Chunk 2: Auth Pages (Login + Signup)

### Task 4: Rewrite login page

**Files:**
- Modify: `pymasters_app/views/login.py`

- [ ] **Step 1: Rewrite `pymasters_app/views/login.py` with Obsidian Terminal split layout**

```python
"""Login page — Obsidian Terminal."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(auth_manager: AuthManager) -> None:
    """Render split login: brand left, form right."""

    brand_col, form_col = st.columns([0.45, 0.55], gap="large")

    with brand_col:
        st.markdown(
            """
            <div class="ob-card ob-grid-bg" style="min-height:420px;display:flex;flex-direction:column;justify-content:space-between;padding:32px;">
                <div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px;">
                        <div style="width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px rgba(34,197,94,0.5);"></div>
                        <span style="color:var(--text-secondary);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">PyMasters</span>
                    </div>
                    <h2 style="font-size:22px;line-height:1.3;margin-bottom:8px;">Learn Python.<br/>Build things.<br/>Ship fast.</h2>
                    <p style="color:var(--text-muted);font-size:13px;">AI-enhanced learning platform for Python mastery.</p>
                </div>
                <div style="display:flex;gap:8px;">
                    <span style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);">3 modules</span>
                    <span style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);">AI tutor</span>
                    <span style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);">Studio</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown("### Sign in")
        st.caption("Welcome back. Enter your credentials to continue.")

        with st.form("login-form", clear_on_submit=False):
            identifier = st.text_input(
                "User ID, email, or phone",
                placeholder="thor11 / you@example.com",
            )
            password = st.text_input(
                "Password",
                type="password",
                placeholder="••••••••",
            )
            submitted = st.form_submit_button("Sign in", use_container_width=True)

        if submitted:
            if not identifier or not password:
                st.error("Please provide your user ID (or email/phone) and password.")
                return

            user = auth_manager.login(identifier=identifier, password=password)
            if not user:
                st.error("Invalid credentials. Please try again.")
                return

            st.success(f"Welcome back, {user['name']}.")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.markdown(
            "<p style='font-size:13px;color:var(--text-muted);margin-top:16px;'>No account? Switch to the <strong style=\"color:var(--text-secondary);\">Sign up</strong> tab.</p>",
            unsafe_allow_html=True,
        )
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/login.py
git commit -m "feat: rewrite login page with Obsidian Terminal design"
```

---

### Task 5: Rewrite signup page

**Files:**
- Modify: `pymasters_app/views/signup.py`

- [ ] **Step 1: Rewrite `pymasters_app/views/signup.py` with Obsidian Terminal split layout**

```python
"""Signup page — Obsidian Terminal."""
from __future__ import annotations

import re

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{4,20}$")


def render(auth_manager: AuthManager) -> None:
    """Render split signup: brand left, form right."""

    brand_col, form_col = st.columns([0.42, 0.58], gap="large")

    with brand_col:
        st.markdown(
            """
            <div class="ob-card ob-grid-bg" style="min-height:520px;display:flex;flex-direction:column;justify-content:space-between;padding:32px;">
                <div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px;">
                        <div style="width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px rgba(34,197,94,0.5);"></div>
                        <span style="color:var(--text-secondary);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">PyMasters</span>
                    </div>
                    <h2 style="font-size:22px;line-height:1.3;margin-bottom:8px;">Create your account.<br/>Start building.</h2>
                    <p style="color:var(--text-muted);font-size:13px;">Choose a user ID and unlock personalized learning paths, AI tutoring, and a generative studio.</p>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div class="ob-card" style="padding:12px 16px;">
                        <strong style="color:var(--text-primary);font-size:13px;">Privacy-first</strong>
                        <span style="display:block;font-size:12px;color:var(--text-muted);margin-top:2px;">Email and phone are always optional.</span>
                    </div>
                    <div class="ob-card" style="padding:12px 16px;">
                        <strong style="color:var(--text-primary);font-size:13px;">Instant access</strong>
                        <span style="display:block;font-size:12px;color:var(--text-muted);margin-top:2px;">Start learning the moment you sign up.</span>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown("### Create account")
        st.caption("All we need is a name, user ID, and password.")

        with st.form("signup-form", clear_on_submit=False):
            name = st.text_input("Full name", placeholder="Ada Lovelace")
            username = st.text_input("User ID", placeholder="thor11", help="4-20 characters. Letters, numbers, dots, dashes.")
            email = st.text_input("Email (optional)", placeholder="ada@example.com")
            phone = st.text_input("Phone (optional)", placeholder="+1 415 555 0111")
            password = st.text_input("Password", type="password", placeholder="Create a strong password")
            confirm_password = st.text_input("Confirm password", type="password", placeholder="Re-enter password")
            submitted = st.form_submit_button("Create account", use_container_width=True)

        if submitted:
            if not all([name.strip(), username.strip(), password, confirm_password]):
                st.error("Name, user ID, and password are required.")
                return
            if not USERNAME_PATTERN.match(username.strip()):
                st.error("User ID must be 4-20 characters: letters, numbers, dots, underscores, dashes.")
                return
            if password != confirm_password:
                st.error("Passwords do not match.")
                return

            ok, user, message = auth_manager.signup(
                name=name,
                username=username,
                password=password,
                email=email or None,
                phone=phone or None,
            )
            if not ok or not user:
                st.error(message or "Unable to create account. Please try again.")
                return

            st.success(f"Welcome, {user['name']}. Redirecting to dashboard.")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.markdown(
            "<p style='font-size:13px;color:var(--text-muted);margin-top:16px;'>Already have an account? Switch to the <strong style=\"color:var(--text-secondary);\">Sign in</strong> tab.</p>",
            unsafe_allow_html=True,
        )
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/signup.py
git commit -m "feat: rewrite signup page with Obsidian Terminal design"
```

---

## Chunk 3: Dashboard

### Task 6: Rewrite dashboard page

**Files:**
- Modify: `pymasters_app/views/dashboard.py`

- [ ] **Step 1: Rewrite `pymasters_app/views/dashboard.py` with Obsidian Terminal design**

```python
"""Dashboard — Obsidian Terminal."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils import helpers
from utils.streamlit_helpers import rerun


STATUS_PILLS = {
    "not_started": ("Queued", "ob-pill-queued"),
    "in_progress": ("In progress", "ob-pill-progress"),
    "completed": ("Completed", "ob-pill-completed"),
}


def render(*, db, user: dict[str, str]) -> None:
    """Render the dashboard with metrics, modules, and progress."""

    modules_collection = db["learning_modules"]
    progress_collection = db["progress"]

    helpers.seed_learning_modules(modules_collection)
    modules = helpers.get_learning_modules(modules_collection)
    progress_map = helpers.get_progress_by_user(progress_collection, user_id=user["id"])
    summary = helpers.summarize_progress(modules, progress_map)

    # Welcome
    name = user.get("name") or user.get("username")
    st.markdown(f"### Welcome back, {name}.")
    status_parts = []
    if summary["in_progress"]:
        status_parts.append(f"{summary['in_progress']} in progress")
    if summary["completed"]:
        status_parts.append(f"{summary['completed']} completed")
    if not status_parts:
        status_parts.append("Ready to start")
    st.caption(" · ".join(status_parts))

    st.markdown("<div class='ob-divider'></div>", unsafe_allow_html=True)

    # Metrics
    m1, m2, m3 = st.columns(3)
    with m1:
        st.markdown(
            f"""<div class="ob-card" style="text-align:center;padding:20px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:var(--text-primary);">{summary['total_modules']}</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-top:4px;">Total modules</div>
            </div>""",
            unsafe_allow_html=True,
        )
    with m2:
        st.markdown(
            f"""<div class="ob-card" style="text-align:center;padding:20px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:var(--warning);">{summary['in_progress']}</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-top:4px;">In progress</div>
            </div>""",
            unsafe_allow_html=True,
        )
    with m3:
        st.markdown(
            f"""<div class="ob-card" style="text-align:center;padding:20px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:var(--accent);">{summary['completed']}</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-top:4px;">Completed</div>
            </div>""",
            unsafe_allow_html=True,
        )

    st.markdown("")
    st.markdown("#### Your modules")

    # Modules
    for module in modules:
        status = progress_map.get(module["id"], {"status": "not_started"}).get("status", "not_started")
        pill_label, pill_class = STATUS_PILLS.get(status, STATUS_PILLS["not_started"])
        tags_html = " ".join(
            f"<span style='background:var(--accent-glow);color:var(--accent);padding:2px 8px;border-radius:4px;font-family:\"JetBrains Mono\",monospace;font-size:10px;letter-spacing:0.05em;'>{tag}</span>"
            for tag in module.get("tags", [])
        )

        st.markdown(
            f"""<div class="ob-card" style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
                    <div>
                        <div style="color:var(--text-primary);font-size:14px;font-weight:600;margin-bottom:4px;">{module['title']}</div>
                        <div style="color:var(--text-secondary);font-size:12px;margin-bottom:8px;">{module['description']}</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">{tags_html}</div>
                    </div>
                    <div style="text-align:right;white-space:nowrap;">
                        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);margin-bottom:6px;">{module['estimated_minutes']} min · {module['difficulty']}</div>
                        <span class="ob-pill {pill_class}">{pill_label}</span>
                    </div>
                </div>
            </div>""",
            unsafe_allow_html=True,
        )

        st.markdown("<div class='ob-btn-secondary'>", unsafe_allow_html=True)
        c1, c2, c3 = st.columns(3)
        if c1.button("Start", key=f"start-{module['id']}"):
            helpers.upsert_progress(progress_collection, user_id=user["id"], module_id=module["id"], status="in_progress")
            st.toast(f"Started {module['title']}")
            rerun()
        if c2.button("Complete", key=f"complete-{module['id']}"):
            helpers.upsert_progress(progress_collection, user_id=user["id"], module_id=module["id"], status="completed")
            st.toast(f"Completed {module['title']}")
            rerun()
        if c3.button("Reset", key=f"reset-{module['id']}"):
            helpers.upsert_progress(progress_collection, user_id=user["id"], module_id=module["id"], status="not_started")
            st.toast(f"Reset {module['title']}")
            rerun()
        st.markdown("</div>", unsafe_allow_html=True)
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/dashboard.py
git commit -m "feat: rewrite dashboard with Obsidian Terminal design"
```

---

## Chunk 4: Tutor (Terminal Style + Rich Visuals)

### Task 7: Create tutor response parser

**Files:**
- Create: `pymasters_app/utils/tutor_parser.py`

- [ ] **Step 1: Create `pymasters_app/utils/tutor_parser.py`**

This module parses structured markers in tutor responses and converts them to styled HTML.

```python
"""Parse tutor response markers into Obsidian Terminal styled HTML."""
from __future__ import annotations

import re
import html


def parse_tutor_response(text: str) -> str:
    """Convert tutor response text with markers into styled HTML.

    Supported markers:
    - ```python ... ``` → syntax-highlighted code block
    - :::concept TERM | EXPLANATION ::: → concept card with green left border
    - :::steps STEP1 | STEP2 | ... ::: → vertical timeline
    - :::compare HEADER1,HEADER2 | ROW1COL1,ROW1COL2 | ... ::: → comparison table
    - Plain text → paragraph
    """
    result = text

    # Code blocks: ```python ... ``` or ``` ... ```
    result = re.sub(
        r"```(\w+)?\n(.*?)```",
        _render_code_block,
        result,
        flags=re.DOTALL,
    )

    # Concept cards: :::concept TERM | EXPLANATION :::
    result = re.sub(
        r":::concept\s+(.*?)\s*\|\s*(.*?)\s*:::",
        _render_concept_card,
        result,
        flags=re.DOTALL,
    )

    # Steps: :::steps STEP1 | STEP2 | ... :::
    result = re.sub(
        r":::steps\s+(.*?)\s*:::",
        _render_steps,
        result,
        flags=re.DOTALL,
    )

    # Comparison tables: :::compare H1,H2 | R1C1,R1C2 | ... :::
    result = re.sub(
        r":::compare\s+(.*?)\s*:::",
        _render_compare_table,
        result,
        flags=re.DOTALL,
    )

    # Wrap remaining plain text lines in paragraphs
    lines = result.split("\n")
    processed = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            processed.append("")
        elif stripped.startswith("<"):
            processed.append(line)
        else:
            processed.append(f"<p style='color:var(--text-secondary);font-size:13px;line-height:1.6;margin:4px 0;'>{stripped}</p>")
    return "\n".join(processed)


def _render_code_block(match: re.Match) -> str:
    lang = match.group(1) or "python"
    code = html.escape(match.group(2).strip())
    return (
        f"<div style='background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:16px;margin:8px 0;overflow-x:auto;'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;'>"
        f"<span style='font-family:\"JetBrains Mono\",monospace;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;'>{lang}</span>"
        f"</div>"
        f"<pre style='margin:0;font-family:\"JetBrains Mono\",monospace;font-size:12px;color:var(--accent);line-height:1.5;white-space:pre-wrap;'><code>{code}</code></pre>"
        f"</div>"
    )


def _render_concept_card(match: re.Match) -> str:
    term = html.escape(match.group(1).strip())
    explanation = html.escape(match.group(2).strip())
    return (
        f"<div style='background:var(--bg-elevated);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;padding:12px 16px;margin:8px 0;'>"
        f"<div style='color:var(--text-primary);font-family:\"JetBrains Mono\",monospace;font-size:13px;font-weight:600;margin-bottom:4px;'>{term}</div>"
        f"<div style='color:var(--text-secondary);font-size:12px;line-height:1.5;'>{explanation}</div>"
        f"</div>"
    )


def _render_steps(match: re.Match) -> str:
    steps = [s.strip() for s in match.group(1).split("|") if s.strip()]
    items = []
    for i, step in enumerate(steps):
        escaped = html.escape(step)
        is_last = i == len(steps) - 1
        line_style = "display:none;" if is_last else ""
        items.append(
            f"<div style='display:flex;gap:12px;'>"
            f"<div style='display:flex;flex-direction:column;align-items:center;'>"
            f"<div style='width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:4px;'></div>"
            f"<div style='width:1px;flex:1;background:var(--border);{line_style}'></div>"
            f"</div>"
            f"<div style='padding-bottom:12px;'>"
            f"<div style='color:var(--text-primary);font-size:12px;line-height:1.5;'>{escaped}</div>"
            f"</div>"
            f"</div>"
        )
    return f"<div style='margin:8px 0;'>{''.join(items)}</div>"


def _render_compare_table(match: re.Match) -> str:
    rows = [r.strip() for r in match.group(1).split("|") if r.strip()]
    if not rows:
        return ""
    headers = [h.strip() for h in rows[0].split(",")]
    header_cells = "".join(
        f"<th style='padding:8px 12px;text-align:left;color:var(--text-muted);font-family:\"JetBrains Mono\",monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid var(--border);'>{html.escape(h)}</th>"
        for h in headers
    )
    body_rows = []
    for row in rows[1:]:
        cells = [c.strip() for c in row.split(",")]
        row_cells = "".join(
            f"<td style='padding:8px 12px;color:var(--text-secondary);font-size:12px;border-bottom:1px solid var(--border-subtle);'>{html.escape(c)}</td>"
            for c in cells
        )
        body_rows.append(f"<tr>{row_cells}</tr>")
    return (
        f"<div style='margin:8px 0;overflow-x:auto;'>"
        f"<table style='width:100%;border-collapse:collapse;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;overflow:hidden;'>"
        f"<thead><tr>{header_cells}</tr></thead>"
        f"<tbody>{''.join(body_rows)}</tbody>"
        f"</table></div>"
    )
```

- [ ] **Step 2: Verify import**

Run: `python -c "from pymasters_app.utils.tutor_parser import parse_tutor_response; print(parse_tutor_response('hello'))"`
Expected: HTML paragraph output

- [ ] **Step 3: Commit**

```bash
git add pymasters_app/utils/tutor_parser.py
git commit -m "feat: add tutor response parser for rich visual content"
```

---

### Task 8: Rewrite tutor page with terminal style

**Files:**
- Modify: `pymasters_app/views/tutor.py`

- [ ] **Step 1: Rewrite `pymasters_app/views/tutor.py` with terminal-style chat and rich visuals**

```python
"""AI Tutor — Terminal-style chat with rich visual responses."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import html as html_mod

import streamlit as st
import requests

from pymasters_app.utils.db import get_database
from pymasters_app.utils.tutor_parser import parse_tutor_response
from config.settings import settings
from pymasters_app.utils.secrets import get_secret


HF_API_BASE = "https://api-inference.huggingface.co/models"

SYSTEM_PROMPT = (
    "You are PyMasters, a friendly senior Python tutor. "
    "Explain step-by-step, show minimal runnable examples, and suggest tests. "
    "Prefer standard library solutions. When code is unsafe, warn clearly.\n\n"
    "FORMAT your responses using these markers for rich visual rendering:\n"
    "- Use ```python ... ``` for code examples\n"
    "- Use :::concept TERM | EXPLANATION ::: for key definitions\n"
    "- Use :::steps STEP1 | STEP2 | STEP3 ::: for step-by-step breakdowns\n"
    "- Use :::compare HEADER1,HEADER2 | ROW1COL1,ROW1COL2 ::: for comparison tables\n"
    "Keep explanations concise and visual."
)


def _headers() -> dict[str, str]:
    token = settings.huggingfacehub_api_token or get_secret("HUGGINGFACEHUB_API_TOKEN")
    if not token:
        raise RuntimeError("Missing HUGGINGFACEHUB_API_TOKEN.")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _chat_completion(model: str, prompt: str, temperature: float, max_new_tokens: int) -> str:
    payload = {
        "inputs": prompt,
        "parameters": {
            "temperature": float(temperature),
            "max_new_tokens": int(max_new_tokens),
            "return_full_text": False,
        },
    }
    url = f"{HF_API_BASE}/{model}"
    resp = requests.post(url, headers=_headers(), json=payload, timeout=120)
    if resp.status_code == 503:
        return "Model is warming up. Please try again in a few seconds."
    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise RuntimeError(f"HF error: {resp.status_code} {detail}")
    try:
        data = resp.json()
    except Exception:
        return resp.text
    if isinstance(data, list) and data and "generated_text" in data[0]:
        return data[0]["generated_text"]
    if isinstance(data, dict) and "generated_text" in data:
        return data["generated_text"]
    return str(data)


def render(*, auth_manager, user: dict[str, Any]) -> None:
    st.markdown("### AI Tutor")
    st.caption("Chat with a Python mentor. Responses include visual explanations.")

    db = get_database()
    sessions = db["tutor_sessions"]

    default_model = "mistralai/Mixtral-8x7B-Instruct-v0.1"
    with st.expander("Settings"):
        model = st.text_input("Model", value=default_model)
        col_t1, col_t2 = st.columns(2)
        with col_t1:
            temperature = st.slider("Creativity", 0.0, 1.5, 0.4, 0.1)
        with col_t2:
            max_tokens = st.slider("Max tokens", 64, 2048, 512, 64)

    # Terminal window header
    st.markdown(
        """<div class="ob-card" style="padding:8px 16px;margin-bottom:0;border-bottom:none;border-radius:10px 10px 0 0;">
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>
                <div style="width:8px;height:8px;border-radius:50%;background:#eab308;"></div>
                <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>
                <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);margin-left:8px;letter-spacing:0.08em;">pymasters-tutor</span>
            </div>
        </div>""",
        unsafe_allow_html=True,
    )

    # Session state
    if "tutor_messages" not in st.session_state:
        st.session_state.tutor_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

    # Chat history
    for msg in st.session_state.tutor_messages:
        if msg["role"] == "user":
            with st.chat_message("user"):
                st.markdown(
                    f"<span style='color:var(--accent);font-family:\"JetBrains Mono\",monospace;font-size:13px;'>▸ {html_mod.escape(msg['content'])}</span>",
                    unsafe_allow_html=True,
                )
        elif msg["role"] == "assistant":
            with st.chat_message("assistant"):
                parsed = parse_tutor_response(msg["content"])
                st.markdown(parsed, unsafe_allow_html=True)

    if prompt := st.chat_input("Ask me anything about Python..."):
        st.session_state.tutor_messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(
                f"<span style='color:var(--accent);font-family:\"JetBrains Mono\",monospace;font-size:13px;'>▸ {html_mod.escape(prompt)}</span>",
                unsafe_allow_html=True,
            )

        text_prompt = "\n\n".join(
            f"{m['role'].upper()}: {m['content']}"
            for m in st.session_state.tutor_messages
            if m["role"] != "system"
        )
        full_prompt = SYSTEM_PROMPT + "\n\n" + text_prompt + "\n\nASSISTANT:"

        with st.spinner("thinking..."):
            try:
                reply = _chat_completion(
                    model=model, prompt=full_prompt, temperature=temperature, max_new_tokens=max_tokens
                )
            except Exception as e:
                reply = f"Error: {e}"

        st.session_state.tutor_messages.append({"role": "assistant", "content": reply})
        with st.chat_message("assistant"):
            parsed = parse_tutor_response(reply)
            st.markdown(parsed, unsafe_allow_html=True)

        sessions.insert_one(
            {
                "user_id": user.get("_id") if user else None,
                "user_email": user.get("email") if user else None,
                "model": model,
                "temperature": float(temperature),
                "max_new_tokens": int(max_tokens),
                "messages": st.session_state.tutor_messages[-4:],
                "created_at": datetime.utcnow(),
            }
        )

    with st.expander("Recent sessions"):
        rows = (
            sessions.find({}, {"model": 1, "created_at": 1})
            .sort("created_at", -1)
            .limit(10)
        )
        for row in rows:
            st.markdown(
                f"<div style='display:flex;align-items:center;gap:8px;padding:4px 0;'>"
                f"<div style='width:6px;height:6px;border-radius:50%;background:var(--accent);'></div>"
                f"<span style='font-family:\"JetBrains Mono\",monospace;font-size:11px;color:var(--text-muted);'>{row.get('created_at'):%Y-%m-%d %H:%M}</span>"
                f"<span style='font-size:11px;color:var(--text-secondary);'>{row.get('model')}</span>"
                f"</div>",
                unsafe_allow_html=True,
            )
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/tutor.py
git commit -m "feat: rewrite tutor with terminal-style chat and rich visual responses"
```

---

## Chunk 5: Studio + Profile

### Task 9: Rewrite studio page

**Files:**
- Modify: `pymasters_app/views/studio.py`

- [ ] **Step 1: Rewrite `pymasters_app/views/studio.py` with Obsidian Terminal card-based design**

```python
"""Generative Studio — Obsidian Terminal card-based design."""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path
from typing import Any

import streamlit as st

from pymasters_app.utils.db import get_database
from services.huggingface_service import (
    HuggingFaceError,
    generate_image,
    generate_video,
)

GENERATED_DIR = Path("generated")
GENERATED_DIR.mkdir(exist_ok=True)


def _save_bytes(data: bytes, suffix: str) -> str:
    ts = int(time.time())
    path = GENERATED_DIR / f"gen_{ts}{suffix}"
    path.write_bytes(data)
    return str(path)


def render(*, user: dict[str, Any]) -> None:
    st.markdown("### Studio")
    st.caption("Generate images and videos with AI models.")

    db = get_database()

    with st.form("gen_form"):
        col1, col2 = st.columns([0.65, 0.35])
        with col1:
            prompt = st.text_area(
                "Prompt",
                value="A futuristic python robot teaching code in a neon-lit lab",
                height=120,
            )
        with col2:
            task = st.selectbox("Task", ["Image", "Video"], index=0)
            if task == "Image":
                default_model = "black-forest-labs/FLUX.1-dev"
            else:
                default_model = "damo-vilab/text-to-video-ms-1.7b"
            model = st.text_input("Model", value=default_model)

        submitted = st.form_submit_button("Generate", use_container_width=True)

    if submitted:
        if not prompt.strip():
            st.warning("Please enter a prompt.")
            return

        try:
            with st.spinner("Generating..."):
                if task == "Image":
                    img = generate_image(prompt=prompt, model=model)
                    file_path = _save_bytes(img.bytes, ".png")
                    st.markdown(
                        "<div class='ob-card' style='padding:12px;'>",
                        unsafe_allow_html=True,
                    )
                    st.image(img.bytes, use_container_width=True)
                    st.markdown(
                        f"<div style='margin-top:8px;font-family:\"JetBrains Mono\",monospace;font-size:10px;color:var(--text-muted);'>"
                        f"{model} · {prompt[:80]}{'...' if len(prompt) > 80 else ''}"
                        f"</div></div>",
                        unsafe_allow_html=True,
                    )
                    mime = img.mime_type
                else:
                    vid = generate_video(prompt=prompt, model=model)
                    file_path = _save_bytes(vid.bytes, ".mp4")
                    st.markdown(
                        "<div class='ob-card' style='padding:12px;'>",
                        unsafe_allow_html=True,
                    )
                    st.video(vid.bytes)
                    st.markdown(
                        f"<div style='margin-top:8px;font-family:\"JetBrains Mono\",monospace;font-size:10px;color:var(--text-muted);'>"
                        f"{model} · {prompt[:80]}{'...' if len(prompt) > 80 else ''}"
                        f"</div></div>",
                        unsafe_allow_html=True,
                    )
                    mime = vid.mime_type

            db["generations"].insert_one(
                {
                    "user_id": user.get("id") if user else None,
                    "user_email": user.get("email") if user else None,
                    "task": task.lower(),
                    "model": model,
                    "prompt": prompt,
                    "mime_type": mime,
                    "file_path": file_path,
                    "created_at": datetime.utcnow(),
                }
            )
            st.success("Saved to history.")
        except HuggingFaceError as e:
            st.error(str(e))
        except Exception as e:
            st.exception(e)

    with st.expander("History"):
        rows = (
            db["generations"]
            .find({}, {"prompt": 1, "task": 1, "model": 1, "created_at": 1})
            .sort("created_at", -1)
            .limit(10)
        )
        for row in rows:
            task_label = (row.get("task") or "image").upper()
            pill_color = "var(--accent)" if task_label == "IMAGE" else "var(--warning)"
            st.markdown(
                f"<div style='display:flex;align-items:center;gap:8px;padding:4px 0;'>"
                f"<span style='font-family:\"JetBrains Mono\",monospace;font-size:10px;color:{pill_color};background:var(--bg-elevated);padding:2px 6px;border-radius:4px;'>{task_label}</span>"
                f"<span style='font-size:11px;color:var(--text-secondary);'>{(row.get('prompt') or '')[:50]}...</span>"
                f"<span style='font-family:\"JetBrains Mono\",monospace;font-size:10px;color:var(--text-muted);margin-left:auto;'>{row.get('created_at'):%Y-%m-%d %H:%M}</span>"
                f"</div>",
                unsafe_allow_html=True,
            )
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/studio.py
git commit -m "feat: rewrite studio with Obsidian Terminal card-based design"
```

---

### Task 10: Rewrite profile page

**Files:**
- Modify: `pymasters_app/views/profile.py`

- [ ] **Step 1: Rewrite `pymasters_app/views/profile.py` with Obsidian Terminal design + settings stub**

```python
"""Profile & Settings — Obsidian Terminal."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(*, auth_manager: AuthManager, user: dict[str, str]) -> None:
    """Render profile management and settings."""

    st.markdown("### Profile")
    st.caption("Manage your account and security settings.")

    st.markdown("<div class='ob-divider'></div>", unsafe_allow_html=True)

    # Profile + Password
    profile_col, password_col = st.columns([0.55, 0.45], gap="large")

    with profile_col:
        st.markdown("#### Account details")
        with st.form("profile-form"):
            name = st.text_input("Full name", value=user.get("name", ""))
            username = st.text_input("User ID", value=user.get("username", ""), help="Visible to others, used for login")
            email = st.text_input("Email (optional)", value=user.get("email", ""))
            phone = st.text_input("Phone (optional)", value=user.get("phone", ""))
            submitted = st.form_submit_button("Save profile", use_container_width=True)

        if submitted:
            ok, message, updated_user = auth_manager.update_profile(
                user["id"],
                name=name,
                username=username,
                email=email or None,
                phone=phone or None,
            )
            if not ok:
                st.error(message or "Failed to update profile.")
            else:
                st.success("Profile updated.")
                if updated_user:
                    st.session_state["user"] = updated_user
                rerun()

    with password_col:
        st.markdown("#### Change password")
        with st.form("password-form", clear_on_submit=True):
            current_password = st.text_input("Current password", type="password")
            new_password = st.text_input("New password", type="password")
            confirm_password = st.text_input("Confirm new password", type="password")
            password_submitted = st.form_submit_button("Update password", use_container_width=True)

        if password_submitted:
            if not current_password or not new_password:
                st.error("All fields are required.")
            elif new_password != confirm_password:
                st.error("New passwords do not match.")
            else:
                ok, message = auth_manager.change_password(
                    user["id"], current_password=current_password, new_password=new_password
                )
                if not ok:
                    st.error(message or "Failed to change password.")
                else:
                    st.success("Password updated.")

    # Danger zone
    st.markdown(
        """<div class="ob-card" style="border-left:3px solid var(--danger);margin-top:24px;">
            <div style="color:var(--text-primary);font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;margin-bottom:4px;">Danger zone</div>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Sign out of your account. This will end your current session.</p>
        </div>""",
        unsafe_allow_html=True,
    )
    st.markdown("<div class='ob-btn-secondary'>", unsafe_allow_html=True)
    if st.button("Sign out", key="profile-signout"):
        auth_manager.logout()
        st.session_state["current_page"] = "Sign in"
        rerun()
    st.markdown("</div>", unsafe_allow_html=True)

    # Settings stub
    with st.expander("Settings"):
        st.markdown("#### Preferences")

        st.toggle("Dark mode", value=True, disabled=True, help="Obsidian Terminal is the default theme")

        st.text_input(
            "HuggingFace API token",
            type="password",
            value="",
            placeholder="hf_...",
            help="Override the default API token for AI features",
            key="settings-hf-token",
        )

        st.markdown("#### Notifications")
        st.checkbox("Email notifications", value=False, disabled=True, help="Coming soon")
        st.checkbox("Progress reminders", value=False, disabled=True, help="Coming soon")
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/profile.py
git commit -m "feat: rewrite profile with Obsidian Terminal design and settings stub"
```

---

## Chunk 6: Cleanup and Verification

### Task 11: Update Streamlit config to match new theme

**Files:**
- Modify: `.streamlit/config.toml`

- [ ] **Step 1: Update `.streamlit/config.toml`**

```toml
[theme]
base = "dark"
primaryColor = "#22c55e"
backgroundColor = "#09090b"
secondaryBackgroundColor = "#18181b"
textColor = "#a1a1aa"
font = "monospace"

[server]
headless = true

[browser]
gatherUsageStats = false
```

- [ ] **Step 2: Commit**

```bash
git add .streamlit/config.toml
git commit -m "feat: update Streamlit config for Obsidian Terminal theme"
```

---

### Task 12: Smoke test the full application

- [ ] **Step 1: Run the application**

Run: `streamlit run app.py --server.headless true --server.port 8501`

- [ ] **Step 2: Manual verification checklist**

Open `http://localhost:8501` and verify:

1. Tab nav shows `SIGN IN` and `SIGN UP` tabs with green underline on active
2. Login page: split layout — brand card (left) with grid background, form (right)
3. Sign up page: same split layout with different copy
4. Sign in with default credentials (`founder` / `Password@123`)
5. After login: tabs change to `DASHBOARD` · `TUTOR` · `STUDIO` · `PLAYGROUND` · `PROFILE`
6. Dashboard: welcome message, 3 metric cards, module list with status pills and action buttons
7. Tutor: terminal window header (3 dots), chat input works, responses render with visual markers
8. Studio: form with prompt/task/model, generation works, history shows
9. Playground: shows "Coming soon in Phase 3" placeholder
10. Profile: two-column layout (profile form + password form), danger zone with sign out, settings expander

- [ ] **Step 3: Final commit with all changes**

```bash
git add -A
git commit -m "feat: complete Phase 1 — Obsidian Terminal UI reskin"
```
