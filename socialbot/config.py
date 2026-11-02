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

SITE = "https://pymasters.net"
YOUTUBE_CHANNEL_ID = "UCH8b9RG8cx8HnFlOJ8-zs1Q"   # PyMasters (@Py-Masters)
LINKEDIN_ORG_URN = os.getenv("PMSOCIAL_LINKEDIN_ORG_URN", "urn:li:organization:113061910")  # PyMasters page

# Owner decisions (2026-11-02): auto-publish when the quality gate passes; a post every day on both channels.
CADENCE = {
    "short": {"per_week": 7, "weekdays": [0, 1, 2, 3, 4, 5, 6], "publish_hhmm": "18:30"},     # daily, IST
    "long": {"per_week": 1, "weekdays": [5], "publish_hhmm": "10:00"},                       # Saturday
    "linkedin": {"per_week": 7, "weekdays": [0, 1, 2, 3, 4, 5, 6], "publish_hhmm": "08:45"},  # daily
}
TIMEZONE = "Asia/Kolkata"

# LLM: Claude Code CLI in headless mode, no tools, pinned model, JSON output.
LLM_MODEL = os.getenv("PMSOCIAL_MODEL", "claude-opus-5-5")
LLM_TIMEOUT_S = 420

# Voice: Kokoro (local). am_michael = clear, warm US male.
TTS_VOICE = os.getenv("PMSOCIAL_VOICE", "am_michael")
TTS_SPEED = 1.06

QUALITY_MIN_SCORE = 7.5      # calibrated critic score (8 = strong senior-engineer post) + no errors/blockers
MAX_ATTEMPTS = 4             # write -> critique -> rewrite rounds before a draft is dropped
NO_REPEAT_DAYS = 120         # same lesson/topic is not reused within this window


def ensure_dirs():
    for d in (STATE_DIR, CONFIG_DIR, RENDERS_DIR, MUSIC_DIR, HF_HOME):
        d.mkdir(parents=True, exist_ok=True)
    try:
        CONFIG_DIR.chmod(0o700)
    except OSError:
        pass
    os.environ.setdefault("HF_HOME", str(HF_HOME))
