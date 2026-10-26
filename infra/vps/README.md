# PyMasters on a VPS

Single-host production layout that replaces Cloud Run (see `docs/HOSTING_COST_OPTIONS.md`
for the why and the cut-over runbook).

| File | Role |
|---|---|
| `bootstrap.sh` | One-time server prep (Ubuntu 24.04): Docker, ufw, fail2ban, unattended-upgrades, swap, `pymasters` deploy user, `/opt/pymasters`. |
| `deploy.sh` | From the laptop: vault → `/opt/pymasters/.env`, sync configs, build the repo's Dockerfile on the host, `docker compose up`, health wait, auto-rollback to `:previous`. |
| `docker-compose.prod.yml` | `app` (same image as Cloud Run: nginx + uvicorn + Litestream) + `caddy` (automatic HTTPS). |
| `Caddyfile` | TLS for pymasters.net, www → apex redirect, security headers, access log. |
| `litestream.yml` | Continuous SQLite replication to an S3-compatible bucket (Cloudflare R2 by default). |
| `pull_backup.sh` | Laptop-side nightly `sqlite3 .backup` over SSH → `~/.pymasters/backups/` (third copy). |

Runtime layout on the host: `/opt/pymasters/{.env,data/pymasters.db,Caddyfile,litestream.yml,docker-compose.prod.yml,src/}`.

Rollback: `docker tag pymasters:previous pymasters:latest && docker compose -f docker-compose.prod.yml up -d app`.
