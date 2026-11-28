# PyMasters Official Presenter Identity & Visual Specification

Every PyMasters visual featuring a human educator MUST anchor directly to the official founder/presenter reference assets stored in `.agents/skills/pymasters-posts/assets/`. Never hallucinate or synthesize an unrelated presenter face from text prompts alone.

## 1. Reference Asset Inventory

| Asset File | Dimensions | Aspect | Primary Use Cases |
| :--- | :--- | :--- | :--- |
| `assets/avatar-headshot.jpg` | `1792×2400` | `56:75` | Tight portrait framing, YouTube thumbnails (`1280×720`), quote cards, LinkedIn `4:5` cards, author badges |
| `assets/avatar-fullbody.jpg` | `1792×2400` | `56:75` | Launch banners (`1200×627`), keynote announcements, full-stage graphics, course release visuals |
| `assets/avatar-stage.gif` | `360×640` (30 frames) | `9:16` | Vertical stage presenter motion loops for YouTube Shorts, Reels, and Telegram video updates |

Verify file integrity against `assets/manifest.json` (SHA-256 checksums) before publishing.

## 2. Canonical Physical Likeness
- **Subject:** Approachable South Asian male tech educator in his early-to-mid 30s.
- **Expression & Face:** Warm, confident smile, expressive dark brown eyes, thick dark eyebrows, natural skin texture, zero over-smoothed plastic AI sheen.
- **Hair & Grooming:** Thick wavy black hair styled with a neat side part; short, neatly trimmed beard and mustache with subtle salt-and-pepper grey on the chin.

## 3. Canonical Wardrobe
- **Keynote / Full-Scene (`avatar-fullbody.jpg`):** Tailored dark navy blazer over a light slate-blue collared button-down shirt (unbuttoned top collar, no tie), dark navy slim chinos, dark leather sneakers with white soles, silver wristwatch on the left wrist, holding a sleek presentation clicker beside a laptop on a modern barstool.
- **Close-Up Studio Teaching (`avatar-headshot.jpg`):** Light slate-blue collared button-down shirt (unbuttoned top collar, no tie) for warm, approachable direct-to-camera instruction.

## 4. Environment, Lighting & Brand Finish
- **Palette:** Obsidian / deep-navy studio (`#060B19` → `#0B132B`), electric-sapphire accents (`#38BDF8`, `#1D4ED8`), champagne-gold highlights (`#E5BE67`, `#FDE8A3`), and crisp cool-white typography (`#F8FAFC`).
- **Brand Mark:** Always include the official vector **PYM shield-monogram crest** (from `frontend/public/logo.svg`) — never substitute raw emoji icons or distorted AI-rendered logos.
- **Code & Typography Rule:** Keep text inside AI-generated imagery minimal (0–4 words max) or reserve clean negative space on the left/right canvas and composite crisp headlines, syntax-highlighted Python snippets, and the PYM crest deterministically via `scripts/templates/presenter_card.html` (`hybrid` or `composite` mode).
- **Zero Hindi Words / Strict Professionalism:** Plain, crystal-clear everyday English (Tamil PyMasters terms like *Vaar* / *Vaathiyaar* and *"Vanakkam nanba and nanbis!"* where fitting); never use Hindi/Hinglish words or whimsical trivia scenarios.
