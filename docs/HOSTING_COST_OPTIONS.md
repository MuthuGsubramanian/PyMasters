# Hosting cost options for pymasters.net (decision brief, 2026-10-26)

## Where the money goes today

| Item | Config | Est. monthly |
|---|---|---|
| Cloud Run `pymasters` | 1 vCPU / 2 GiB, **min-instances 1, CPU always allocated** (Litestream needs a live process) | ≈ $58 (CPU $47 + memory $10.5 before the small free-tier credit) |
| Artifact Registry | 3.7 GB of images, pruned to 5 | ≈ $0.40 |
| GCS replica bucket | 16 MB | < $0.01 |
| Logging / egress / Secret Manager | ~500 API req/day | ≈ $1–2 |
| **Total** | | **≈ $60/month** (matches the July bill of $61) |

The app itself is tiny: ~500 API requests a day, a 17 MB SQLite database, one container. 95% of the bill is the "keep one instance warm" requirement, which Cloud Run prices like a full VM.

Cheaper *within* GCP is not available without changing architecture: min-instances 0 with throttled CPU costs ~$5 but gives 20–40 s cold starts (Whisper + embedding models load at boot) and breaks Litestream; Cloud SQL would cost more than the whole bill today.

## Options (prices as published in Oct 2026 — they moved a lot this year; confirm on the provider page before signing up)

| Option | Spec | Monthly | Pros | Cons |
|---|---|---|---|---|
| **OVHcloud VPS-1** | 2 vCore / 4 GB / 40 GB NVMe, unlimited traffic | **≈ $4.5–6** | Cheapest reputable tier, anti-DDoS included, Singapore/Mumbai-region options, no term lock | Shared CPU; support is basic |
| **Contabo Cloud VPS (10/S)** | 4 vCPU / 8 GB / NVMe | ≈ €5–8 (often a one-off setup fee, best price on 12–24 month terms) | Most RAM per euro, Singapore region | Slower support, provisioning takes hours, reputation is mixed |
| Hetzner CX23 / CPX22 | 2 vCPU / 4 GB | €5.5–6 (EU only, frequently unorderable) / €20 (CPX22, €26 in Singapore) | Best tooling and reliability | Two price rises in 2026 made non-EU locations expensive |
| DigitalOcean / Vultr / Linode | 2 vCPU / 4 GB | ≈ $20–24 | Polished consoles, predictable | 4× the OVH price for the same box |
| Fly.io | shared-cpu-2x 2 GB + 10 GB volume | ≈ $12–16 | Deploys from a Dockerfile like Cloud Run, global anycast | Still 2–3× a VPS; volumes are single-host |
| Oracle Cloud Always Free (Ampere A1) | now 2 OCPU / 12 GB | $0 | Free | Allowance halved in 2026, idle instances get reclaimed, capacity errors, no support — fine for staging, not for the only production copy |
| Stay on Cloud Run, shrink | 1 vCPU / 1 GiB | ≈ $35 | Zero migration work | Memory headroom is thin with Whisper + embeddings; still 6× a VPS |

## Recommendation

**Move production to a single OVHcloud VPS-1 (Singapore if most learners are in India; Gravelines/EU otherwise), fronted by Caddy, with Litestream replicating SQLite to Cloudflare R2 (free tier).** Expected bill: **≈ $5–6/month** against ≈ $60 today, i.e. ~90% less, with 2× the vCPU and 2× the RAM the app has now. Contabo is the alternative if 8 GB RAM is wanted for the same money and a longer term is acceptable.

Efficiency gains, not just cost: no cold starts ever, no 1-vCPU throttle during lesson generation, host-level backups (provider snapshots) on top of Litestream, and deploys that take 2 minutes (build on host) instead of 10.

What is kept on GCP after the move: nothing billable except Secret Manager (cents) until the secrets are migrated into the laptop vault, then the project can be left with billing on but idle (≈ $0.40 for stored images, or delete them).

## Migration runbook (everything under `infra/vps/`)

1. **You:** create the VPS (Ubuntu 24.04), add your SSH public key, note the IPv4. Put the root/SSH details in the vault: `python ops/vault/pmvault.py set VPS_HOST --value "<ip>"`.
2. **You:** create a Cloudflare account (free) → R2 → bucket `pymasters-db` → API token with Object Read & Write. Vault: `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY`, `REPLICA_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`), `REPLICA_BUCKET=pymasters-db`, `REPLICA_REGION=auto`. *(GCS cannot be used from outside GCP: the org policy blocks service-account keys and HMAC keys — checked 2026-10-26.)*
3. **You (one-off):** `gcloud auth login muthu@pymasters.net` so I can copy the GCP Secret Manager values into the vault (JWT secret, SMTP, OAuth client secrets, Ollama/Qubrid keys). Without this the VPS would start with new secrets and every existing session/OAuth app would need re-linking.
4. **Me:** `curl … bootstrap.sh | bash` on the VPS (Docker, firewall, fail2ban, swap, deploy user), then `infra/vps/deploy.sh pymasters@<ip> main` from the laptop: builds the image on the host, writes `/opt/pymasters/.env` from the vault, starts app + Caddy, waits for `/health`, rolls back automatically on failure.
5. **Me:** seed the database: `litestream restore` from the GCS replica is impossible off-GCP, so I copy the live DB once with `gcloud storage cp` to the laptop and `scp` it to `/opt/pymasters/data/` during a 2-minute freeze window (announce, deploy, switch DNS).
6. **You:** DNS at Wix: change the `A` record for `pymasters.net` and `www` to the VPS IP (or move nameservers to Cloudflare, which was already planned). Caddy obtains certificates automatically once DNS resolves.
7. **Me:** verify (health, login, chat, Litestream replica objects in R2), update the GitHub deploy workflow to SSH-deploy instead of Cloud Run, update the uptime check target, then scale Cloud Run to min-instances 0 for a week as a cold fallback, and finally delete the Cloud Run service and domain mapping.
8. **Me:** nightly `infra/vps/pull_backup.sh` on the laptop keeps a third copy of the database here.

Rollback at any point before step 7's deletion: point DNS back at Cloud Run.

## Inputs this needs from you (nothing else)

| # | Input | Why only you |
|---|---|---|
| 1 | VPS account + payment method, server created, SSH key added | Account creation and card entry |
| 2 | Cloudflare account + R2 API token (free) | Account creation |
| 3 | `gcloud auth login muthu@pymasters.net` on this laptop | Google sign-in with your passkey |
| 4 | Wix DNS change (or nameserver move) | Wix login |

Everything else — vault, bootstrap, build, deploy, data copy, cut-over, verification, decommission, monitoring — runs from this laptop under my control.

Sources consulted for 2026 prices: [Hetzner pricing 2026 (bitdoze)](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/), [Hetzner CX23 price tables (cloudhim)](https://www.cloudhim.com/cloud-costs/hetzner-cx22-pricing-2026), [Hetzner review (betterstack)](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/), [2026 VPS price comparison (vpssos)](https://vpssos.com/how-much-do-1-vcpu2gb-2-vcpu-4gb-and-4-vcpu-8gb-servers-cost/), [Cheapest VPS Oct 2026 (prehost)](https://prehost.com/ranking/cheap-vps/), [Cheap VPS hosting (cybernews)](https://cybernews.com/vps/cheapest-vps-hosting/), [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm), [Oracle free-tier limits change (InfoQ)](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/), [Oracle free VPS guide 2026](https://space-node.net/blog/oracle-cloud-free-vps-guide-2026).
