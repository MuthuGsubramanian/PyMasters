# Ops laptop automation (copies of what runs on the PyMasters ops laptop)

Live copies run from `~/pymasters-ops/` and `~/.config/systemd/user/`; these are versioned backups so the setup
survives a dead disk. No secrets here (OAuth tokens live in `~/.config/pymasters-social/`, 0600).

| File | What it does |
|---|---|
| `collect_status.sh` | Read-only facts: site health, CI, commits, VM, backups, GCP cost guards, laptop heat, social bot, topic innovation queue, GCP spend, open reminders |
| `daily_report.sh` + `pymasters-daily-report.{service,timer}` | 09:00 IST: headless Claude turns the facts into the owner's status email (Gmail send tool only) |
| `thermal_guard.py` + `pymasters-thermal-guard.service` | Freezes (cgroup.freeze) `pymasters-heavy.slice` and the social bot above 80 C, thaws below 68 C after >= 90 s (and SIGCONTs anything left SIGSTOPped), starts frozen if restarted while hot, thaws when stopped, alerts >= 90 C with the top CPU users; logs `thermal.{log,csv}`. Added after 100 C hardware power-offs on 2026-11-02 and 2026-11-03 |
| `pymasters-heavy.slice` + `heavy` | Every heavy ops job (image builds, scenario runs, headless browsers, solution generators, social renders) runs in this slice, capped at 1 of 8 CPUs in total (2 reached 97 C in 20 s): `~/pymasters-ops/heavy <cmd>`; scenario containers join it via `PM_E2E_CGROUP_PARENT=pymasters-heavy.slice`. One heavy job at a time. `heavy_selftest.sh` proves the cap and the freezer; `temps.py` prints temperatures, load and top CPU users |
| `innovate_topics.py` + `pymasters-innovate.{service,timer}` | Every 2 h (in `pymasters-heavy.slice`, Nice 15, waits while >= 80 C until <= 68 C): finds new lesson topics from concept gaps, `BACKLOG.md` and free feeds (HF trending/papers, arXiv cs.AI/cs.LG, GitHub trending) via `claude --dangerously-skip-permissions -p` (fallbacks: Ollama Cloud gpt-oss:120b, local llama-server), drafts the top one as a full lesson + reference solution and validates it with the production grader. Output: `~/pymasters-ops/innovation/{queue.json,review/INDEX.md}`; nothing reaches the repo until the owner runs `innovate_topics.py --promote <id>` (branch + PR). `--status` prints a JSON summary |

Restore: copy the scripts to `~/pymasters-ops/`, the units to `~/.config/systemd/user/`, then
`systemctl --user daemon-reload && systemctl --user enable --now pymasters-daily-report.timer pymasters-thermal-guard.service pymasters-social.timer pymasters-prod-smoke.timer pymasters-innovate.timer` (copy `pymasters-heavy.slice` too)
and `sudo loginctl enable-linger $USER`. The social bot itself lives in `socialbot/` (see its README).
