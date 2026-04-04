# PyMasters Autonomous AI Platform — Design Spec

**Date:** 2026-04-04
**Author:** Claude Code (Cloud Architect + Dev Orchestrator for PyMasters)
**Approved by:** Muthu (Founder, PyMasters)

---

## 1. Vision

PyMasters becomes a self-evolving AI organization where daily intelligence drives content creation, feature development, and product growth — autonomously. Two products evolve in parallel: **pymasters.net** (flagship learning platform) and **heyhomie.app** (local-first AI assistant). Claude Code operates as the dedicated cloud architect and development orchestrator with full autonomy.

## 2. Organization

- **Brand:** PyMasters
- **Parent product:** pymasters.net — Python/AI learning platform (React + FastAPI + DuckDB, deployed on GCP Cloud Run)
- **Sub-product:** Homie (heyhomie.app) — local-first self-evolving AI assistant (Python, llama.cpp, ChromaDB, voice pipeline)
- **GitHub org:** MuthuGsubramanian (12 repos)
- **HuggingFace:** Muthu88
- **GCP account:** muthu@pymasters.net
- **Founder:** Muthu (muthu.g.subramanian@gmail.com / muthu@pymasters.net)

## 3. Infrastructure

### 3.1 Compute Tiers

| Tier | Machine | Role | Availability |
|---|---|---|---|
| Command Center | MSI Alpha 15 — Ryzen 7 3750H, 14GB RAM, AMD RX 5500M, 512GB SSD, Win11 Pro | Orchestration, dev, automation, always-on crons | 24/7 |
| GPU Burst | Laptop with RTX 5080, connected via Tailscale | Local model inference, fine-tuning, Homie testing | Intermittent |
| Cloud | GCP (20K INR/month budget) | Hosting, CI/CD, managed services, backup compute | 24/7 |

### 3.2 Network

- Tailscale connects dev machine and GPU laptop
- Automation scripts are Tailscale-aware: check GPU machine reachability before routing work there, fall back to GCP

### 3.3 Authority Model

- Claude Code has **full autonomy** over this dev machine and GCP
- No permission requests for routine operations
- Guardrails: 20K INR budget cap, CI gates, quality thresholds
- Only pause for: budget overruns, production data deletion, ambiguous product direction

## 4. GCP Architecture

### 4.1 Always-On Services

| Service | Purpose | Est. Cost/mo (INR) |
|---|---|---|
| Cloud Run (pymasters) | Host pymasters.net | ~3,000 |
| Artifact Registry | Docker images | ~500 |
| Cloud Build | CI/CD on push to main | ~1,000 |
| Secret Manager | API keys, credentials | ~100 |
| Cloud Storage | Data, models, backups | ~500 |
| Cloud Monitoring + Alerts | Health, budget, uptime | Free tier |
| Cloud Scheduler | Backup crons | ~200 |
| Pub/Sub | Event bus | ~200 |

### 4.2 On-Demand Services

| Service | Purpose | Est. Cost/mo (INR) |
|---|---|---|
| Cloud Functions (2nd gen) | Automation glue | ~500 |
| Vertex AI (API) | Backup inference when local unavailable | ~2,000-4,000 |
| Spot GPU VM (T4/L4) | Model experiments, fine-tuning | ~5,000-8,000 |

### 4.3 Budget Controls

| Control | Setting |
|---|---|
| Billing alerts | 50% (10K), 80% (16K), 100% (20K) INR |
| Spot VM auto-shutdown | Max 4 hours per session |
| Cloud Run max instances | 3 |
| Monthly hard cap | 20K INR via budget API |

**Total estimated: 12,000-18,000 INR/month** with 2-8K buffer.

### 4.4 Infrastructure as Code

- All GCP resources managed via Terraform, state stored in Cloud Storage
- Cloud Build triggers for both PyMasters and Homie repos
- Secret Manager for all sensitive values
- Managed SSL certificates for both domains

### 4.5 Ongoing Cloud Architect Duties

| Frequency | Task |
|---|---|
| Daily | Check billing, review Cloud Run logs, verify pipelines ran |
| Weekly | Cost optimization, unused resource cleanup, security audit |
| Monthly | Budget vs actuals report, capacity planning, Terraform updates |
| On-demand | Spot GPU VMs, debug deployments, scale services |

### 4.6 Alerting

| Alert | Condition | Action |
|---|---|---|
| Budget 50% | 10K INR | Log warning in daily report |
| Budget 80% | 16K INR | Reduce spot VM usage, flag to Muthu |
| Budget 100% | 20K INR | Stop all non-essential services |
| pymasters.net down | Health check fails 3x | Auto-restart Cloud Run, email Muthu |
| Build failure | Cloud Build red | Create fix PR or flag if complex |
| Error spike | >5% error rate | Investigate logs, create fix PR |

## 5. Daily AI Intelligence Pipeline

Runs from the dev machine at 6:00 AM IST daily.

### 5.1 Stage 1: Discover

| Source | What | Method |
|---|---|---|
| HuggingFace | Trending models, datasets, spaces | HF API (Muthu88 account) |
| arXiv | New AI/ML papers (cs.AI, cs.LG, cs.CL) | arXiv API |
| GitHub Trending | Trending Python/AI repos | GitHub API |
| Papers With Code | SOTA benchmark changes | PwC API |
| Reddit | r/MachineLearning, r/LocalLLaMA | Reddit API |
| Hacker News | AI-related front page | HN API |

### 5.2 Stage 2: Analyze

Claude API processes raw data and produces:
- Relevance score (0-10) per item against PyMasters focus areas
- Product mapping: pymasters.net vs Homie vs both
- Content opportunities: "This paper could become lesson X" / "This technique = Homie plugin"
- Trend signals: emerging patterns across sources

### 5.3 Stage 3: Act

| Action | Target | Trigger |
|---|---|---|
| Generate lesson draft | pymasters.net PR | Relevance >= 7 for learning |
| Create feature issue | Homie GitHub | Relevance >= 6 for Homie |
| Generate implementation PR | Homie repo | High-confidence small improvements |
| Publish summary | Blog/social draft | Top 3 daily findings |
| Publish model/space | HuggingFace | When fine-tuning or creation happens |
| Email daily digest | muthu@pymasters.net | Always |

### 5.4 Stage 4: Daily Report (email to muthu@pymasters.net)

Contents:
- Top 10 discoveries
- Actions taken (PRs, issues, deploys)
- GCP spend-to-date
- Product health (uptime, errors)
- Repo activity summary

## 6. Autonomous Product Evolution

Both products evolve daily in parallel, fed by the intelligence pipeline.

### 6.1 pymasters.net Evolution

| Cycle | What | Automation |
|---|---|---|
| Content | New lessons from trending AI/Python topics | Auto-PR → Cloud Build test → merge if green |
| Vaathiyaar | AI tutor improvements — prompts, error explanations | PR to backend/vaathiyaar |
| Classroom | New exercises, challenges, coding problems | PR to backend/lessons + frontend |
| UX | Analytics-driven improvements | Cloud Run logs → analysis → fix PR |
| SEO | Meta tags, sitemap, structured data for new content | PR with SEO metadata per lesson |
| Performance | Weekly Lighthouse audit | Cloud Function audit → PR if score drops |

### 6.2 heyhomie.app Evolution

| Cycle | What | Automation |
|---|---|---|
| Plugins | New plugins from trending tools/APIs | Pipeline discovers → Claude Code writes → PR |
| Models | Track new GGUF models, benchmark, update recommendations | HF scan → test on 5080/GCP spot → update Modelfile |
| Self-evolution | Improve reasoning, tool orchestration, memory | Analyze subsystems → propose improvements |
| Voice | Evaluate new TTS/STT models | HF scan → benchmark → PR if better |
| Docs/Website | Auto-update docs, changelog, heyhomie.app (static site in Homie repo website/ dir, hosted via GitHub Pages or Cloud Run) | PR to website/ and docs/ |
| Releases | Weekly automated release if enough changes | GitHub Actions → tag → build installers → publish |

### 6.3 Cross-Pollination

- Every pymasters.net lesson on a technique → check if Homie could use it → create Homie issue
- Every new Homie capability → create pymasters.net tutorial on building it
- Both products link to each other in UI and docs

### 6.4 Safeguards

| Risk | Mitigation |
|---|---|
| Bad auto-generated content | All PRs require CI pass. High-impact PRs flagged for Muthu review |
| PR flood | Max 3 content PRs + 2 feature PRs per product per day |
| Quality drift | Weekly quality audit of auto-generated content |
| Breaking changes | Full test suite on all PRs before merge |
| Low-value content | Relevance threshold >= 7 filters noise |

## 7. Growth Engine

### 7.1 SEO & Discoverability

| Channel | Strategy | Automation |
|---|---|---|
| Google | Each lesson = unique page with structured data, trending keywords | Auto-generated meta, sitemap, schema.org |
| HuggingFace | Publish models, datasets, spaces under Muthu88, link to pymasters.net | Pipeline publishes demos as HF Spaces |
| GitHub | Well-maintained repos, good READMEs, active issues | Auto-update READMEs, organize issues |
| Dev communities | Reddit, HN, Dev.to insights | Draft posts queued for review |

### 7.2 Content Marketing Flywheel

```
Trending AI topic discovered
  ├──→ pymasters.net lesson (auto-PR)
  ├──→ Homie plugin if applicable (auto-PR)
  ├──→ HF Space demo (auto-publish)
  ├──→ Blog post draft (queued for review)
  └──→ Social snippet (queued for review)
        All link back to pymasters.net + heyhomie.app
```

### 7.3 Innovation Pipeline

| Stage | What | Cadence |
|---|---|---|
| Scan | Identify emerging techniques with no good implementation | Daily |
| Evaluate | Score by feasibility, relevance, novelty, demand | Daily |
| Prototype | Top ideas get quick prototype (script, notebook, HF Space) | 2-3/week |
| Integrate | Successful prototypes become features/plugins | 1-2/week |
| Ship | Merged, tested, deployed | Continuous |

### 7.4 Innovation Backlog

Auto-maintained `BACKLOG.md` in each repo:
- **Ready to Build** (scored >= 8, prototype validated)
- **Prototyping** (scored >= 7, being tested)
- **Evaluating** (scored >= 6, needs research)
- **Discovered** (new, unscored)

## 8. Implementation Phases

| Phase | Timeline | Deliverables |
|---|---|---|
| **1: Foundation** | Week 1-2 | Install gcloud, Docker, Terraform on dev machine. GCP project setup (IAM, billing alerts, Secret Manager). Clone both repos. Cloud Build triggers for both products. |
| **2: Intelligence Pipeline** | Week 3-4 | Daily discovery + analysis pipeline (Python). Cron at 6 AM IST. Email digest. HF/arXiv/GitHub scraping live. |
| **3: Auto-Evolution** | Month 2 | Content auto-generation for pymasters.net. Feature PRs for Homie. Cross-pollination. CI gates. Innovation backlog. |
| **4: Growth Engine** | Month 2-3 | SEO automation. HF Space publishing. Social drafts. Analytics → improvement loop. |
| **5: Full Flywheel** | Month 3+ | Full autonomy. Weekly quality audits. Monthly strategy reviews. Continuous innovation. Both products evolving daily. |

## 9. Success Metrics

| Metric | Phase 1-2 Target | Phase 3-5 Target |
|---|---|---|
| Daily pipeline runs | 100% uptime | 100% uptime |
| Auto-generated PRs/week | - | 10-15 across both repos |
| pymasters.net lessons | Current count | +4-8 per week |
| Homie plugins | Current count | +1-2 per week |
| GCP spend | < 15K INR/mo | < 20K INR/mo |
| pymasters.net uptime | 99%+ | 99.5%+ |
| HF Spaces published | - | 2-4 per month |
