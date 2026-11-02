# Ops laptop automation (copies of what runs on the PyMasters ops laptop)

Live copies run from `~/pymasters-ops/` and `~/.config/systemd/user/`; these are versioned backups so the setup
survives a dead disk. No secrets here (OAuth tokens live in `~/.config/pymasters-social/`, 0600).

| File | What it does |
|---|---|
| `collect_status.sh` | Read-only facts: site health, CI, commits, VM, backups, GCP cost guards, laptop heat, social bot, GCP spend, open reminders |
| `daily_report.sh` + `pymasters-daily-report.{service,timer}` | 09:00 IST: headless Claude turns the facts into the owner's status email (Gmail send tool only) |
| `thermal_guard.py` + `pymasters-thermal-guard.service` | Pauses (SIGSTOP) the heavy units above 82 C, resumes below 68 C after >= 2 min; logs `thermal.{log,csv}`. Added after a 100 C hardware power-off on 2026-11-02 |

Restore: copy the scripts to `~/pymasters-ops/`, the units to `~/.config/systemd/user/`, then
`systemctl --user daemon-reload && systemctl --user enable --now pymasters-daily-report.timer pymasters-thermal-guard.service pymasters-social.timer`
and `sudo loginctl enable-linger $USER`. The social bot itself lives in `socialbot/` (see its README).
