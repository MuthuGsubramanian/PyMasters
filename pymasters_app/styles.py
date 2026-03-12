"""
Obsidian Terminal CSS Design System for PyMasters.

Inject once in main.py via:
    st.markdown(OBSIDIAN_CSS, unsafe_allow_html=True)
"""

OBSIDIAN_CSS = """
<style>
/* ============================================================
   GOOGLE FONTS
   ============================================================ */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

/* ============================================================
   CSS CUSTOM PROPERTIES (DESIGN TOKENS)
   ============================================================ */
:root {
    /* Background */
    --bg-primary:   #09090b;
    --bg-card:      #0a0a0a;
    --bg-elevated:  #18181b;

    /* Borders */
    --border:        #27272a;
    --border-subtle: #1c1c1e;

    /* Typography */
    --text-primary:   #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted:     #52525b;

    /* Accent */
    --accent:      #22c55e;
    --accent-glow: rgba(34, 197, 94, 0.15);

    /* Semantic */
    --danger:  #ef4444;
    --warning: #eab308;

    /* Misc */
    --radius:      6px;
    --radius-lg:   10px;
    --transition:  0.18s ease;
}

/* ============================================================
   BASE — hide sidebar chrome, global background & font
   ============================================================ */
html, body, [data-testid="stAppViewContainer"], [data-testid="stApp"] {
    background-color: var(--bg-primary) !important;
    color: var(--text-primary) !important;
    font-family: 'Inter', sans-serif !important;
}

/* Hide the default Streamlit sidebar toggle / decoration */
[data-testid="collapsedControl"],
[data-testid="stSidebarNav"],
section[data-testid="stSidebar"] > div:first-child > div:first-child {
    display: none !important;
}

/* Sidebar background */
section[data-testid="stSidebar"] {
    background-color: var(--bg-card) !important;
    border-right: 1px solid var(--border) !important;
}

/* Main content max-width */
.block-container {
    max-width: 1100px !important;
    padding-top: 2rem !important;
    padding-bottom: 3rem !important;
}

/* ============================================================
   TYPOGRAPHY
   ============================================================ */
h1, h2, h3, h4 {
    font-family: 'JetBrains Mono', monospace !important;
    color: var(--text-primary) !important;
    letter-spacing: -0.02em;
}

h1 { font-size: 1.75rem !important; font-weight: 700 !important; }
h2 { font-size: 1.35rem !important; font-weight: 600 !important; }
h3 { font-size: 1.1rem  !important; font-weight: 600 !important; }
h4 { font-size: 0.95rem !important; font-weight: 500 !important; }

p, label, span {
    color: var(--text-secondary) !important;
    font-family: 'Inter', sans-serif !important;
    line-height: 1.6;
}

/* ============================================================
   WIDGET OVERRIDES
   ============================================================ */

/* --- Form container --- */
[data-testid="stForm"] {
    background-color: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius-lg) !important;
    padding: 1.5rem !important;
}

/* --- Primary button --- */
[data-testid="stButton"] > button {
    background-color: var(--accent) !important;
    color: #000 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.8rem !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    border: none !important;
    border-radius: var(--radius) !important;
    padding: 0.55rem 1.25rem !important;
    transition: opacity var(--transition), box-shadow var(--transition) !important;
    cursor: pointer !important;
}
[data-testid="stButton"] > button:hover {
    opacity: 0.88 !important;
    box-shadow: 0 0 14px var(--accent-glow) !important;
}
[data-testid="stButton"] > button:active {
    opacity: 0.75 !important;
}

/* --- Metric --- */
[data-testid="stMetric"] {
    background-color: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius-lg) !important;
    padding: 1rem 1.25rem !important;
}
[data-testid="stMetricLabel"] {
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.7rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.1em !important;
    color: var(--text-muted) !important;
}
[data-testid="stMetricValue"] {
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 1.6rem !important;
    font-weight: 700 !important;
    color: var(--text-primary) !important;
}
[data-testid="stMetricDelta"] {
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.75rem !important;
}

/* --- Text inputs --- */
[data-testid="stTextInput"] input,
[data-testid="stTextArea"] textarea,
[data-testid="stNumberInput"] input {
    background-color: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    color: var(--text-primary) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.85rem !important;
    padding: 0.55rem 0.8rem !important;
    transition: border-color var(--transition) !important;
}
[data-testid="stTextInput"] input:focus,
[data-testid="stTextArea"] textarea:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 2px var(--accent-glow) !important;
    outline: none !important;
}

/* --- Select / Multiselect --- */
[data-testid="stSelectbox"] div[data-baseweb="select"] > div,
[data-testid="stMultiSelect"] div[data-baseweb="select"] > div {
    background-color: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    color: var(--text-primary) !important;
}

/* --- Chat messages --- */
[data-testid="stChatMessage"] {
    background-color: var(--bg-elevated) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-lg) !important;
    padding: 0.75rem 1rem !important;
    margin-bottom: 0.5rem !important;
}

/* --- Chat input container --- */
[data-testid="stChatInputContainer"] {
    background-color: var(--bg-card) !important;
    border-top: 1px solid var(--border) !important;
    padding: 0.75rem 0 !important;
}
[data-testid="stChatInputContainer"] textarea {
    background-color: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    color: var(--text-primary) !important;
    font-family: 'Inter', sans-serif !important;
}
[data-testid="stChatInputContainer"] textarea:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 2px var(--accent-glow) !important;
}

/* --- Expander --- */
[data-testid="streamlit-expanderHeader"] {
    background-color: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.8rem !important;
    color: var(--text-secondary) !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
}
[data-testid="streamlit-expanderContent"] {
    background-color: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-top: none !important;
    border-radius: 0 0 var(--radius) var(--radius) !important;
    padding: 1rem !important;
}

/* --- Alerts --- */
[data-testid="stAlert"] {
    border-radius: var(--radius) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.82rem !important;
    border-left-width: 3px !important;
}
[data-testid="stAlert"][kind="info"] {
    background-color: rgba(34, 197, 94, 0.07) !important;
    border-color: var(--accent) !important;
    color: var(--accent) !important;
}
[data-testid="stAlert"][kind="error"] {
    background-color: rgba(239, 68, 68, 0.07) !important;
    border-color: var(--danger) !important;
    color: var(--danger) !important;
}
[data-testid="stAlert"][kind="warning"] {
    background-color: rgba(234, 179, 8, 0.07) !important;
    border-color: var(--warning) !important;
    color: var(--warning) !important;
}

/* ============================================================
   CUSTOM UTILITY CLASSES
   ============================================================ */

/* --- Card --- */
.ob-card {
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    transition: border-color var(--transition);
}
.ob-card:hover {
    border-color: var(--accent);
}

/* --- Secondary button wrapper --- */
.ob-btn-secondary [data-testid="stButton"] > button {
    background-color: transparent !important;
    color: var(--text-secondary) !important;
    border: 1px solid var(--border) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.78rem !important;
    font-weight: 500 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
    border-radius: var(--radius) !important;
    padding: 0.45rem 1rem !important;
    transition: border-color var(--transition), color var(--transition) !important;
}
.ob-btn-secondary [data-testid="stButton"] > button:hover {
    border-color: var(--accent) !important;
    color: var(--accent) !important;
    box-shadow: none !important;
    opacity: 1 !important;
}

/* --- Tab navigation (radio override) --- */
.ob-tab-nav [data-testid="stRadio"] > div {
    display: flex !important;
    flex-direction: row !important;
    gap: 0 !important;
    border-bottom: 1px solid var(--border) !important;
    padding-bottom: 0 !important;
    margin-bottom: 1.25rem !important;
}
.ob-tab-nav [data-testid="stRadio"] label {
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.68rem !important;
    font-weight: 500 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.1em !important;
    color: var(--text-muted) !important;
    padding: 0.45rem 1rem !important;
    border-bottom: 2px solid transparent !important;
    cursor: pointer !important;
    transition: color var(--transition), border-color var(--transition) !important;
    background: transparent !important;
    user-select: none !important;
}
.ob-tab-nav [data-testid="stRadio"] label:hover {
    color: var(--text-secondary) !important;
}
/* Hide the actual radio input circle */
.ob-tab-nav [data-testid="stRadio"] input[type="radio"] {
    display: none !important;
}
/* Active tab — uses :has() where supported; fallback handled via JS/st trick */
.ob-tab-nav [data-testid="stRadio"] input[type="radio"]:checked + div {
    color: var(--accent) !important;
    border-bottom-color: var(--accent) !important;
}
.ob-tab-nav [data-testid="stRadio"] label[data-selected="true"],
.ob-tab-nav [data-testid="stRadio"] label:has(input:checked) {
    color: var(--accent) !important;
    border-bottom-color: var(--accent) !important;
}

/* --- Status pills --- */
.ob-pill {
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 0.2rem 0.6rem;
    border-radius: 99px;
    border: 1px solid transparent;
}
.ob-pill--queued {
    background-color: rgba(82, 82, 91, 0.25);
    border-color: var(--text-muted);
    color: var(--text-muted);
}
.ob-pill--progress {
    background-color: rgba(234, 179, 8, 0.12);
    border-color: var(--warning);
    color: var(--warning);
}
.ob-pill--completed {
    background-color: rgba(34, 197, 94, 0.12);
    border-color: var(--accent);
    color: var(--accent);
}
.ob-pill--danger {
    background-color: rgba(239, 68, 68, 0.12);
    border-color: var(--danger);
    color: var(--danger);
}

/* --- Grid background decoration --- */
.ob-grid-bg {
    background-image:
        linear-gradient(var(--border-subtle) 1px, transparent 1px),
        linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
    background-size: 40px 40px;
    background-position: center center;
}

/* --- Divider --- */
.ob-divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1.5rem 0;
}

/* ============================================================
   SCROLLBAR STYLING
   ============================================================ */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: var(--bg-primary);
}
::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
}

/* Firefox */
* {
    scrollbar-width: thin;
    scrollbar-color: var(--border) var(--bg-primary);
}

/* ============================================================
   STREAMLIT MISC OVERRIDES
   ============================================================ */

/* Top toolbar / hamburger menu */
#MainMenu, footer, header { visibility: hidden !important; }

/* Dataframe / table */
[data-testid="stDataFrame"] {
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    overflow: hidden !important;
}

/* Spinner */
[data-testid="stSpinner"] {
    color: var(--accent) !important;
}

/* Progress bar */
[data-testid="stProgressBar"] > div > div {
    background-color: var(--accent) !important;
}

/* Code blocks */
code, pre {
    font-family: 'JetBrains Mono', monospace !important;
    background-color: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    color: var(--accent) !important;
    font-size: 0.82rem !important;
}
pre {
    padding: 1rem !important;
}
code {
    padding: 0.1em 0.35em !important;
}
</style>
"""
