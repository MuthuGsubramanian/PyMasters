# PyMasters on Compute Engine (production since 2026-10-27)

| Piece | Where |
|---|---|
| VM | `pymasters-vm`, `us-central1-a`, `e2-micro` (free tier), Ubuntu 24.04, 30 GB pd-standard, static IP `35.206.69.198` (`pymasters-ip`), tag `web`, SA `pymasters-vm@pymasters-app.iam.gserviceaccount.com` (objectAdmin on `gs://pymasters-app-db`, reader on Artifact Registry) |
| Stack | `/opt/pymasters/` → `docker-compose.yml` (app image from Artifact Registry `:latest` + `caddy:2.9.1`), `.env` (0600, from the laptop vault), `litestream.yml` (GCS, prefix `vm/`), `Caddyfile` |
| Rollout | `pymasters-update.timer` → `update.sh` every 2 min: docker login via metadata token, pull `:latest`, restart only on digest change, health-wait, rollback to `.previous_digest` |
| Health | `https://pymasters.net/health` and, DNS-independent, `http://35.206.69.198/health` (reports `build` = git SHA) |
| Deploy config/secrets | `infra/gce/deploy.sh` (laptop, OpenSSH with `~/.ssh/google_compute_engine`); `--bootstrap` on a fresh VM |
| Cut-over / rollback | `infra/gce/cutover.sh freeze|verify|finish|rollback` |
| Play (games) | Kill switch: `PLAY_ENABLED=0` in `.env` makes every `/api/play/*` route answer 503 (page shows "taking a short break"). Content banks ship in the image (`backend/games/banks/*.json`); rebuild locally with `python backend/games/build_banks.py <game>` and commit. Learner rounds live in `game_rounds`; XP in `xp_awards`. |
| Backups | Litestream → `gs://pymasters-app-db/vm/pymasters.db` (7-day WAL history, 6 h snapshots); `infra/vps/pull_backup.sh` for a laptop copy |

Useful commands

```
ssh -i ~/.ssh/google_compute_engine muthu@35.206.69.198
sudo journalctl -u pymasters-update -n 50          # rollout log
sudo docker logs pymasters-app --tail 100
sudo /opt/pymasters/update.sh --force|--rollback
gcloud compute instances set-machine-type pymasters-vm --zone us-central1-a --machine-type e2-small   # if RAM is short
```
