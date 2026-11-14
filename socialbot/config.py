"""PyMasters social bot: settings and paths.

Runs on the PyMasters ops laptop (Linux). Code lives in the repo; state, secrets, models and renders
live outside it:
  ~/.local/share/pymasters-social/state.db    history of everything planned/rendered/published
  ~/.config/pymasters-social/                  OAuth client files (0600); tokens go to the keyring
  /mnt/eternity-store/EternityModels/pymasters-social/   Kokoro model cache + rendered media (big files)
"""
import os
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LESSONS_DIR = REPO / "backend" / "lessons"

STATE_DIR = Path(os.getenv("PMSOCIAL_STATE_DIR", Path.home() / ".local/share/pymasters-social"))
CONFIG_DIR = Path(os.getenv("PMSOCIAL_CONFIG_DIR", Path.home() / ".config/pymasters-social"))
# Big files go to the Eternity model store when the machine has one, else next to the state db.
_STORE = Path("/mnt/eternity-store/EternityModels/pymasters-social")
MEDIA_DIR = Path(os.getenv("PMSOCIAL_MEDIA_DIR", _STORE if _STORE.parent.is_dir() else STATE_DIR / "media"))
RENDERS_DIR = MEDIA_DIR / "renders"
MUSIC_DIR = MEDIA_DIR / "music"          # optional royalty-free beds (*.mp3/*.wav); none = no music
HF_HOME = MEDIA_DIR / "hf"
DB_PATH = STATE_DIR / "state.db"
DRIVE_MANIFEST_PATH = STATE_DIR / "drive_sync.json"

SITE = "https://pymasters.net"
YOUTUBE_CHANNEL_ID = "UCH8b9RG8cx8HnFlOJ8-zs1Q"   # PyMasters (@Py-Masters)
LINKEDIN_ORG_URN = os.getenv("PMSOCIAL_LINKEDIN_ORG_URN", "urn:li:organization:113061910")  # PyMasters page
LINKEDIN_ORG_NAME = os.getenv("PMSOCIAL_LINKEDIN_ORG_NAME", "PyMasters")
LINKEDIN_ORG_MENTION = f"@[{LINKEDIN_ORG_NAME}]({LINKEDIN_ORG_URN})"
GOOGLE_DRIVE_EMAIL = os.getenv("PMSOCIAL_DRIVE_EMAIL", "muthu.g.subramanian@gmail.com")
DRIVE_ROOT_FOLDER = os.getenv("PMSOCIAL_DRIVE_FOLDER", "PyMasters Social Content")

# Owner decisions (2026-11-14): keep YouTube focused (daily Short + weekly Long); minimize LinkedIn to 1 post/week.
CADENCE = {
    "short": {"per_week": 7, "weekdays": [0, 1, 2, 3, 4, 5, 6], "publish_hhmm": "18:30"},     # daily, IST
    "long": {"per_week": 1, "weekdays": [5], "publish_hhmm": "10:00"},                       # Saturday
    # minimized to once per week (Wednesday 10:00 IST)
    "linkedin": {"per_week": 1, "weekdays": [2], "publish_hhmm": "10:00"},
    # retired as a separate weekly slot so LinkedIn never exceeds 1 post/week total
    "thematic": {"per_week": 0, "weekdays": [], "publish_hhmm": "11:00"},
}
INTERVAL_EPOCH = (2026, 11, 1)   # day the interval grid starts from (at publish_hhmm IST); fixed so slots never shift
TIMEZONE = "Asia/Kolkata"

# LLM: Claude Code CLI in headless mode, no tools, pinned model, JSON output.
LLM_MODEL = os.getenv("PMSOCIAL_MODEL", "claude-opus-5-5")
LLM_TIMEOUT_S = 420

# Voice: Kokoro (local). am_michael = clear, warm US male.
TTS_VOICE = os.getenv("PMSOCIAL_VOICE", "am_michael")
TTS_SPEED = 1.06

QUALITY_MIN_SCORE = 7.5      # calibrated critic score (8 = strong, accessible piece) + no errors/blockers
SIMPLICITY_MIN_SCORE = 7.5   # videos must explain concepts simply enough for non-technical viewers
MAX_ATTEMPTS = 4             # write -> critique -> rewrite rounds before a draft is dropped
NO_REPEAT_DAYS = 120         # same lesson/topic is not reused within this window
LINKEDIN_BUSINESS_STYLES = (
    "business_story",        # real-world banking/finance/product story in plain English (no code wall)
    "boardroom_explainer",   # 60-second executive mental model of an AI/risk concept in simple terms
    "executive_playbook",    # before-vs-after industry decision matrix & ROI breakdown
)
LINKEDIN_TECH_STYLES = (
    "tech_deep_dive",        # under-the-hood engineering walkthrough with runnable Python 3.11
    "myth_vs_benchmark",     # technical misconception vs executed Python benchmark
    "production_code_audit", # principal-engineer bug/risk audit with verified Python fix
)
LINKEDIN_STYLES = LINKEDIN_BUSINESS_STYLES + LINKEDIN_TECH_STYLES
HF_SPACE_SHARE = 0.10        # occasional spotlight on our live Hugging Face Spaces (explained simply)
TREND_SHARE = 0.20           # occasional live trend spotlight broken down in simple everyday terms


def ensure_dirs():
    for d in (STATE_DIR, CONFIG_DIR, RENDERS_DIR, MUSIC_DIR, HF_HOME):
        d.mkdir(parents=True, exist_ok=True)
    try:
        CONFIG_DIR.chmod(0o700)
    except OSError:
        pass
    os.environ.setdefault("HF_HOME", str(HF_HOME))
