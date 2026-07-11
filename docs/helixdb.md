# HelixDB backend for the semantic curriculum index

The semantic index (`backend/semantic/store.py`, endpoints under
`/api/semantic/*`) runs fully in-process by default (numpy + fastembed).
It can optionally mirror the curriculum graph + vectors into a
[HelixDB](https://github.com/HelixDB/helix-db) instance and serve vector
search from there.

## Enable locally

```bash
docker compose -f docker-compose.helix.yml up -d
# then run the backend with:
HELIX_URL=http://127.0.0.1:6969 uvicorn main:app --port 8001
```

On boot the index builds locally, then syncs `Lesson` nodes (slug, title,
track, module, 384-dim embedding) into HelixDB and flips
`GET /api/semantic/status` to `"backend": "helix"`. Any Helix failure at
sync or query time falls back to the local matrix automatically.

## Why it is NOT enabled in production (2026-07-12)

Evaluated during the autonomous build session; decision recorded here so it
isn't re-litigated from memory:

1. **Licensing.** Since v2/v3 the HelixDB *engine* ships only as a
   proprietary Docker image (`ghcr.io/helixdb/enterprise-dev`, OCI license
   label `LicenseRef-Proprietary`, explicitly a "development image"). The
   GitHub repo (Apache-2.0) now contains only the CLI and client SDKs.
   Baking those binaries into the PyMasters production image means shipping
   unlicensed proprietary software.
2. **Persistence.** Self-hosted Helix is in-memory only (`S3_BUCKET=IN_MEMORY`);
   disk mode is hardwired to a MinIO/S3 sidecar (open issue #946). Our data
   is derived and rebuildable, so this is survivable — but it buys nothing
   over the in-process matrix at our scale (~520 lessons ≈ 0.8 MB of vectors).
3. **Maturity.** The Python SDK (`helix-db`) is v0.1.x alpha; the project
   deprecated its entire v1 API surface (HelixQL, `helix-py`) within months.

Revisit when HelixDB ships a licensed self-host story with filesystem
persistence (issues #926/#946). The seam is one env var.
