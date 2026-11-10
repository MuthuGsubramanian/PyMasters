#!/bin/bash
# Daily PyMasters status email: collect facts (read-only), then a headless Claude (or zero-GCP-cost Ollama/local-llama/plain-table + SMTP fallback) writes and sends the email.
set -u
export PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
[ -f ~/.config/pymasters-ops/ops.env ] && { set -a; source ~/.config/pymasters-ops/ops.env; set +a; }
MARK=~/pymasters-ops/reports/sent-$(date +%F)
[ -e "$MARK" ] && { echo "already sent today"; exit 0; }   # one email per day, even after a manual run
F=$(~/pymasters-ops/collect_status.sh)
PROMPT="You are the PyMasters ops owner writing the owner's daily status email. The owner is not a GCP expert.
FORMAT (htmlBody, simple inline-styled HTML that renders in Gmail; no external CSS, no images):
1. A one-line overall status at the top: 🟢 All good / 🟡 Needs attention / 🔴 Action required, plus one plain-English sentence.
2. Table 'Health' with columns Area | Status | Details. Rows: Website, Deploys & CI, Test health, Production server, AI tutor & content job, Backups, Laptop (ops machine) heat, YouTube & LinkedIn bot.
   Test health (section '## Test health'): 🔴 if Tier 1 on main is failing or the production smoke FAILED or did not run; 🟡 if the nightly has failures or flaky > 0 (name the first failures in Details); else 🟢.
   Status is 🟢 / 🟡 / 🔴. Details: one short plain-English line each.
3. Table 'GCP cost (owner ceiling ₹5,000/month)' with columns Item | This month | Free/limit | Status: month-to-date net spend in INR vs ₹5,000,
   GCS Class A operations vs 5,000 free, VM outbound traffic vs 1 GB free, Artifact Registry GB vs 0.5 GB free, Secret Manager versions vs 6 free.
   Show ALL money in Indian Rupees (₹); if a value is in USD convert at ₹84 per USD and say 'approx.'.
4. Table 'What changed since yesterday' (commits/content/bot posts) with columns What | Detail, max 8 rows.
5. Table 'Your actions' with columns # | Action | Why — every item under 'Open reminders', highlighted, most urgent first. If none, say so.
Status rules: 🔴 if site not OK, live build != main, CI failed, backup older than 6 h, overheat power-off, or month spend > ₹4,500;
🔴 if AI provider failures shown to learners (24h) > 20; 🟡 if the content job did not publish or AI provider failures > 0, or if RAM/disk > 85%, any free-tier item over its free amount, a Cloud Run service exists, a new billed project, bot publish errors, or laptop max temp > 85C;
else 🟢. Keep it short and factual; use only the raw status below, never invent numbers.
Send it with the Gmail send_message tool to muthu.g.subramanian@gmail.com, subject 'PyMasters daily status — $(date +%F)', as htmlBody. Send it exactly once, and include 'message id <id>' (the 16-hex-char Gmail message id returned by the tool) in your final text reply.

$(cat "$F")"

LOG=~/pymasters-ops/reports/send-$(date +%F).log
claude -p "$PROMPT" --dangerously-skip-permissions --allowedTools mcp__claude_ai_Gmail__send_message --output-format text > "$LOG" 2>&1
if grep -q -i -E "(message id[^0-9a-f]*[0-9a-f]{16}|\b[0-9a-f]{16}\b)" "$LOG"; then
  touch "$MARK"
  exit 0
fi

# Fallback when Claude CLI hits weekly usage limit or transient error. Zero GCP cost (never calls Vertex AI):
#   Ollama Cloud (gpt-oss:120b) -> local llama-server (:8080) -> deterministic HTML table from raw status; sent via SMTP.
python3 - "$F" "$(date +%F)" >> "$LOG" 2>&1 <<'PY'
import html as htmllib, json, os, re, smtplib, sys, urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

status_file, today = sys.argv[1], sys.argv[2]
raw_status = open(status_file, encoding="utf-8").read()
LLAMA_KEY_FILE = Path("/run/user/1000/eternity/keys/llama-8080.key")


def ops_env(name):
    if os.environ.get(name):
        return os.environ[name]
    try:
        for line in (Path.home() / ".config/pymasters-ops/ops.env").read_text().splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[7:].lstrip()
            key, sep, val = line.partition("=")
            if sep and key.strip() == name:
                return val.strip().strip("'\"")
    except OSError:
        pass
    return ""

prompt = f"""You are the PyMasters ops owner writing the owner's daily status email for {today}.
Output ONLY the raw HTML body (no ```html fences, no markdown, simple inline-styled HTML tables that render cleanly in Gmail):
1. A one-line overall status at the top: 🟢 All good / 🟡 Needs attention / 🔴 Action required, plus one plain-English sentence.
2. Table 'Health' with columns Area | Status | Details. Rows: Website, Deploys & CI, Test health, Production server, AI tutor & content job, Backups, Laptop (ops machine) heat, YouTube & LinkedIn bot.
3. Table 'GCP cost (owner ceiling ₹5,000/month)' with columns Item | This month | Free/limit | Status (all money in ₹ INR).
4. Table 'What changed since yesterday' (What | Detail, max 8 rows).
5. Table 'Your actions' (# | Action | Why — items under 'Open reminders').
Use only the raw status below, never invent numbers.

RAW STATUS:
{raw_status}"""


def chat(url, key, model=None, timeout=120):
    body = {"messages": [{"role": "user", "content": prompt}], "temperature": 0.2}
    if model:
        body["model"] = model
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers)
    resp = json.load(urllib.request.urlopen(req, timeout=timeout))
    out = (resp["choices"][0]["message"].get("content") or "").strip()
    out = re.sub(r"^\s*```(?:html)?\s*|\s*```\s*$", "", out, flags=re.S).strip()
    if "<" not in out:
        raise ValueError("model did not return HTML")
    return out


def plain_table():
    """Deterministic HTML from raw_status: one row per '## section'. Needs no network, never fails."""
    sections, cur = [], ["Status", []]
    for line in raw_status.splitlines():
        if line.startswith("#"):
            if cur[1]:
                sections.append(cur)
            cur = [line.lstrip("#").strip() or "Status", []]
        elif line.strip():
            cur[1].append(line.rstrip())
    if cur[1]:
        sections.append(cur)
    td = 'style="border:1px solid #ddd;padding:6px;vertical-align:top;font-family:monospace;white-space:pre-wrap"'
    rows = "".join(
        f"<tr><td {td}><b>{htmllib.escape(name)}</b></td><td {td}>{htmllib.escape(chr(10).join(lines))}</td></tr>"
        for name, lines in sections
    )
    return (
        f"<p>⚪ <b>Raw status for {today}</b> (AI summary unavailable today; facts below are unedited).</p>"
        f'<table style="border-collapse:collapse;font-size:13px"><tr><th {td}>Section</th><th {td}>Details</th></tr>'
        f"{rows}</table>"
    )


def llama_key():
    try:
        return LLAMA_KEY_FILE.read_text().strip()
    except OSError:
        return ""


html, via = None, None
for name, fn in (
    ("Ollama Cloud", lambda: chat("https://ollama.com/v1/chat/completions", ops_env("OLLAMA_API_KEY"), "gpt-oss:120b")),
    ("local llama-server", lambda: chat("http://127.0.0.1:8080/v1/chat/completions", llama_key(), timeout=300)),
):
    try:
        html, via = fn(), name
        break
    except Exception as e:
        print(f"{name} fallback failed: {e}")
if html is None:
    html, via = plain_table(), "plain table"

smtp_user = ops_env("SMTP_USER")
smtp_pass = ops_env("SMTP_PASS")
if not smtp_user or not smtp_pass:
    raise RuntimeError("SMTP_USER/SMTP_PASS not set in ops.env")

msg = MIMEMultipart("alternative")
msg["Subject"] = f"PyMasters daily status — {today}"
msg["From"] = f"PyMasters Ops <{ops_env('FROM_EMAIL') or smtp_user}>"
msg["To"] = "muthu.g.subramanian@gmail.com"
msg.attach(MIMEText(raw_status, "plain", "utf-8"))
msg.attach(MIMEText(html, "html", "utf-8"))

with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as s:
    s.starttls()
    s.login(smtp_user, smtp_pass)
    s.sendmail(smtp_user, ["muthu.g.subramanian@gmail.com"], msg.as_string())

print(f"Sent via {via} + SMTP fallback: message id fallback00000001")
PY
grep -q -i -E "(message id[^0-9a-f]*[0-9a-f]{16}|\b[0-9a-f]{16}\b|fallback00000001)" "$LOG" && touch "$MARK"
