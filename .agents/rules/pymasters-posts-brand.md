---
trigger: model_decision
description: Apply whenever generating or editing PyMasters social media posts, LinkedIn articles, Reddit threads, Telegram updates, YouTube thumbnails, banners, or marketing copy.
---

# PyMasters Social & Brand Enforcement Rule

When creating, editing, or reviewing any PyMasters promotional copy, social post, thumbnail, or marketing banner:

1. **Load the Skill First:** Activate and follow `.agents/skills/pymasters-posts/SKILL.md`, `references/presenter-spec.md`, and `references/platform-playbooks.md`.
2. **Anchor Every Presenter Visual:** Never generate a human presenter face from text prompts alone. Always ground human visuals strictly on `.agents/skills/pymasters-posts/assets/avatar-headshot.jpg`, `avatar-fullbody.jpg`, or `avatar-stage.gif` via `scripts/generate_post_pack.py`.
3. **Live Metrics Only:** Fetch current track, lesson, path, concept, and locale counts dynamically from `definitions.py` / `generate_post_pack.py --stats`; never cite stale hardcoded numbers.
4. **AST-Verified Python Code:** Validate every Python snippet with `ast.parse()` before embedding it in post copy or visual overlays.
5. **Accurate Brand Positioning & CTAs:**
   - Describe **PyMasters** (`https://pymasters.net`) as a free-to-start, zero-jargon, hands-on Python & AI engineering platform featuring **Vaar (*Vaathiyaar*)** (adaptive AI teacher with Socratic hints, AST reviews, voice tutoring, and Teach It Back checks), **"Watch It Run"** step-by-step visual execution, and `LearnAnything` on-demand lessons.
   - Include `https://pymasters.net` on every post and `https://t.me/boost/PyMasterscommunity` on Telegram, YouTube descriptions, Shorts, and community announcements.
   - Write in crisp, plain everyday English (zero Hindi/Hinglish words, zero hype fluff, no raw markdown formatting in LinkedIn posts).
6. **Zero Secret Leakage:** Read `GEMINI_API_KEY` / `GOOGLE_API_KEY` strictly from environment variables; never store keys or tokens inside `.agents/`.
