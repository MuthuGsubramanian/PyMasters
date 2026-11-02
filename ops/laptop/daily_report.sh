#!/bin/bash
# Daily PyMasters status email: collect facts (read-only), then a headless Claude writes and sends the email.
set -u
export PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin
MARK=~/pymasters-ops/reports/sent-$(date +%F)
[ -e "$MARK" ] && { echo "already sent today"; exit 0; }   # one email per day, even after a manual run
F=$(~/pymasters-ops/collect_status.sh)
PROMPT="You are the PyMasters ops owner writing the owner's daily status email. The owner is not a GCP expert.
FORMAT (htmlBody, simple inline-styled HTML that renders in Gmail; no external CSS, no images):
1. A one-line overall status at the top: 🟢 All good / 🟡 Needs attention / 🔴 Action required, plus one plain-English sentence.
2. Table 'Health' with columns Area | Status | Details. Rows: Website, Deploys & CI, Production server, Backups, Laptop (ops machine) heat, YouTube & LinkedIn bot.
   Status is 🟢 / 🟡 / 🔴. Details: one short plain-English line each.
3. Table 'GCP cost (owner ceiling ₹5,000/month)' with columns Item | This month | Free/limit | Status: month-to-date spend in INR vs ₹5,000,
   GCS Class A operations vs 5,000 free, VM outbound traffic vs 1 GB free, Artifact Registry GB vs 0.5 GB free, Secret Manager versions vs 6 free.
   Show ALL money in Indian Rupees (₹); if a value is in USD convert at ₹84 per USD and say 'approx.'.
4. Table 'What changed since yesterday' (commits/content/bot posts) with columns What | Detail, max 8 rows.
5. Table 'Your actions' with columns # | Action | Why — every item under 'Open reminders', highlighted, most urgent first. If none, say so.
Status rules: 🔴 if site not OK, live build != main, CI failed, backup older than 6 h, overheat power-off, or month spend > ₹4,500;
🟡 if RAM/disk > 85%, any free-tier item over its free amount, a Cloud Run service exists, a new billed project, bot publish errors, or laptop max temp > 85C;
else 🟢. Keep it short and factual; use only the raw status below, never invent numbers.
Send it with the Gmail send_message tool to muthu.g.subramanian@gmail.com, subject 'PyMasters daily status — $(date +%F)', as htmlBody. Send it exactly once. Do nothing else.

$(cat "$F")"
claude -p "$PROMPT" --allowedTools mcp__claude_ai_Gmail__send_message --output-format text > ~/pymasters-ops/reports/send-$(date +%F).log 2>&1
grep -q -i -E "sent|message id|1a1[0-9a-f]+" ~/pymasters-ops/reports/send-$(date +%F).log && touch "$MARK"
