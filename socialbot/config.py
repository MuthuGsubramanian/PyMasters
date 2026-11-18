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

# Owner decisions (2026-11-17): YouTube focused (daily Short + weekly Long);
# LinkedIn Company Page posts once every hour from 10:00 AM to 11:00 PM IST (14 slots/day, simplifying complex topics).
LINKEDIN_WINDOW_HOURS_IST = (10, 23)   # inclusive IST hours: 10:00, 11:00, ..., 23:00 IST
LINKEDIN_AHEAD = 3                     # keep next 3 hourly LinkedIn slots pre-rendered ahead of :00
LINKEDIN_NO_REPEAT_DAYS = 18           # ~250 unique complex topics before cycling across 288+ lessons + trends + Spaces

CADENCE = {
    "short": {"per_week": 7, "weekdays": [0, 1, 2, 3, 4, 5, 6], "publish_hhmm": "18:30"},     # daily, IST
    "long": {"per_week": 1, "weekdays": [5], "publish_hhmm": "10:00"},                       # Saturday
    # Hourly on the hour from 10:00 AM to 11:00 PM IST (14 posts/day, 98 posts/week)
    "linkedin": {
        "per_week": 98,
        "weekdays": [0, 1, 2, 3, 4, 5, 6],
        "publish_hhmm": "10:00",
        "interval_hours": 1,
        "window_hours": LINKEDIN_WINDOW_HOURS_IST,
    },
    # retired as a separate weekly slot so all LinkedIn posts follow the hourly schedule
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
SIMPLICITY_MIN_SCORE = 7.5   # complex topics must be broken down with crystal-clear intuition
TOPIC_DEPTH_MIN_SCORE = 7.5  # underlying subject must be genuinely complex/substantive (never basic/toy tasks)
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

# Human-influencer & Zero-Cost Gemini / NotebookLM Hybrid YouTube pipeline
def _ops_env_get(key: str, default: str = "") -> str:
    val = os.getenv(key, "").strip()
    if val:
        return val
    ops_file = Path.home() / ".config/pymasters-ops/ops.env"
    if ops_file.is_file():
        try:
            for line in ops_file.read_text(encoding="utf-8").splitlines():
                s = line.strip()
                if s and not s.startswith("#") and "=" in s:
                    k, v = s.split("=", 1)
                    if k.strip() == key:
                        return v.strip().strip("'\"")
        except OSError:
            pass
    return default


# Strictly bound to unbilled project `eternity-os-11012219` (`billingEnabled: false`) -> $0.00 hard guarantee
GEMINI_FREE_API_KEY = _ops_env_get("GEMINI_FREE_API_KEY")
GEMINI_FREE_PROJECT = _ops_env_get("GEMINI_FREE_PROJECT", "eternity-os-11012219")
GEMINI_TTS_MODEL = os.getenv("PMSOCIAL_GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
GEMINI_TEXT_MODEL = os.getenv("PMSOCIAL_GEMINI_TEXT_MODEL", "gemini-2.5-flash")
GEMINI_SHORT_VOICE = os.getenv("PMSOCIAL_GEMINI_SHORT_VOICE", "Charon")
GEMINI_LONG_SPEAKERS = (("Vaathiyaar", "Charon"), ("Ananya", "Aoede"))

# Hybrid mode (owner decision, 2026-11-17):
# - Daily 9:16 Shorts include Live AI Influencer ("Vanakkam nanba and nanbis!")
# - Weekly 16:9 Long videos use 2-host NotebookLM/Gemini conversational audio WITHOUT an on-screen presenter
SHORT_LIVE_INFLUENCER = os.getenv("PMSOCIAL_SHORT_INFLUENCER", "1") == "1"
LONG_LIVE_PRESENTER = os.getenv("PMSOCIAL_LONG_PRESENTER", "0") == "1"
LONG_CONVERSATIONAL_AUDIO = os.getenv("PMSOCIAL_LONG_CONVERSATIONAL", "1") == "1"
CDP_URL = os.getenv("PMSOCIAL_CDP_URL", "http://127.0.0.1:9222")
GOOGLE_VIDS_AVATAR_NAME = os.getenv("PMSOCIAL_VIDS_AVATAR", "William")
PRESENTER_ASSETS_DIR = Path(__file__).resolve().parent / "assets" / "presenter"
PRESENTER_PLATES_DIR = MEDIA_DIR / "presenter_plates"

INFLUENCER_ENABLED = os.getenv("PMSOCIAL_INFLUENCER_ENABLED", "1") == "1"
AVATAR_PROVIDER = os.getenv("PMSOCIAL_AVATAR_PROVIDER", "google_zero_cost").strip().lower()
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY", "").strip()
HEYGEN_AVATAR_ID = os.getenv("HEYGEN_AVATAR_ID", "Aditya_public_1").strip()
HEYGEN_VOICE_ID = os.getenv("HEYGEN_VOICE_ID", "").strip()
TAVUS_API_KEY = os.getenv("TAVUS_API_KEY", "").strip()
TAVUS_REPLICA_ID = os.getenv("TAVUS_REPLICA_ID", "").strip()
SYNTHESIA_API_KEY = os.getenv("SYNTHESIA_API_KEY", "").strip()
SYNTHESIA_AVATAR_ID = os.getenv("SYNTHESIA_AVATAR_ID", "").strip()
PLAYWRIGHT_PYTHON = os.getenv(
    "PMSOCIAL_PLAYWRIGHT_PYTHON",
    str(Path.home() / "pymasters-ops/e2e-venv/bin/python"),
)


def ensure_dirs():
    for d in (STATE_DIR, CONFIG_DIR, RENDERS_DIR, MUSIC_DIR, HF_HOME, PRESENTER_PLATES_DIR):
        d.mkdir(parents=True, exist_ok=True)
    try:
        CONFIG_DIR.chmod(0o700)
    except OSError:
        pass
    os.environ.setdefault("HF_HOME", str(HF_HOME))
