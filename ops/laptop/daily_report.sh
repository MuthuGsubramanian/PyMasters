#!/bin/bash
# Daily PyMasters status email: collect facts (read-only), then a headless Claude writes and sends the email.
set -u
export PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin
F=$(~/pymasters-ops/collect_status.sh)
PROMPT="You are the PyMasters ops owner. Below is today's raw status. Write a short daily status email for the owner, who is not a GCP expert:
an overall GREEN/AMBER/RED line, then what changed, then problems with a plain-English explanation, then anything the owner must do (always repeat every item under 'Open reminders' prominently).
Flag as problems: site not OK, a live build that doesn't match main, CI failures, RAM/disk above 85%, a backup older than 6 hours, any Cloud Run service existing at all, and any new billed project.
Send it with the Gmail send_message tool to muthu.g.subramanian@gmail.com, subject 'PyMasters daily status — $(date +%F)', as htmlBody. Send it exactly once. Do nothing else.

$(cat "$F")"
claude -p "$PROMPT" --allowedTools mcp__claude_ai_Gmail__send_message --output-format text > ~/pymasters-ops/reports/send-$(date +%F).log 2>&1
