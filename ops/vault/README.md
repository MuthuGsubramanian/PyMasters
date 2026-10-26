# PyMasters local secret vault

The ops laptop is the single operator machine for PyMasters, so credentials live
there in one encrypted store instead of scattered User env vars, `.env` files and
chat messages.

- **Tool:** `ops/vault/pmvault.py` (no dependencies; Windows DPAPI, CurrentUser scope —
  only this Windows account on this machine can decrypt).
- **Store:** `%USERPROFILE%\.pymasters\vault\store.json` (outside the repo).
- **Index of what is where:** `%USERPROFILE%\.pymasters\SECRETS_INDEX.md` — regenerated
  on every change; names, purposes and consumers only, never values. It also lists the
  secrets that live elsewhere (GCP Secret Manager, GitHub, gh keyring).
- **Consumers:** every laptop automation calls `pipeline.utils.secrets.load_secrets()`
  at start-up (daily pipeline, social worker, post_now, YouTube upload/authorize);
  `infra/vps/deploy.sh` writes the runtime `.env` on the server from the vault.

```
python ops/vault/pmvault.py list
python ops/vault/pmvault.py set LINKEDIN_ORG_URN --value "urn:li:organization:123" --used-by "pipeline LinkedIn publisher"
python ops/vault/pmvault.py set-file YOUTUBE_CLIENT_SECRET_JSON path\to\client_secret.json
python ops/vault/pmvault.py get QUBRID2_API_KEY
python ops/vault/pmvault.py run -- python -m pipeline.post_now
```

Rules: never commit values; rotate at the issuer then `set` the new value; keep notes
current with `--note` / `--used-by` so the index stays truthful.
