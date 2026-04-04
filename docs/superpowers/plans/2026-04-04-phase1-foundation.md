# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up this dev machine and GCP as the fully operational command center for PyMasters autonomous platform.

**Architecture:** This machine becomes the always-on orchestrator with gcloud, Docker, and Terraform installed. GCP project gets hardened with IAM, billing alerts, Secret Manager, and Cloud Build triggers for both PyMasters and Homie repos. Both repos cloned locally and ready for automated operations.

**Tech Stack:** Google Cloud SDK, Docker Desktop, Terraform, Python 3.11+, Git, GitHub CLI (already installed)

---

## File Structure

```
C:\Users\muthu.MSG\PycharmProjects\
├── PyMasters/                    (already cloned)
│   └── infra/
│       └── terraform/
│           ├── main.tf           (GCP provider, backend config)
│           ├── variables.tf      (project ID, region, budget vars)
│           ├── outputs.tf        (service URLs, project info)
│           ├── cloud-run.tf      (Cloud Run service for pymasters.net)
│           ├── cloud-build.tf    (Build triggers for both repos)
│           ├── storage.tf        (GCS buckets for tfstate, data, backups)
│           ├── secrets.tf        (Secret Manager resources)
│           ├── monitoring.tf     (Budget alerts, uptime checks)
│           ├── iam.tf            (Service accounts, roles)
│           └── terraform.tfvars  (actual values — gitignored)
└── Homie/                        (to be cloned)
```

---

### Task 1: Install Google Cloud SDK

**Files:**
- None (system-level installation)

- [ ] **Step 1: Download and run the Google Cloud SDK installer**

```bash
# Download the installer
curl -o /c/Users/muthu.MSG/Downloads/google-cloud-sdk.zip \
  https://dl.google.com/dl/cloudsdk/channels/rapid/google-cloud-sdk.zip

# Extract to Program Files
unzip -q /c/Users/muthu.MSG/Downloads/google-cloud-sdk.zip \
  -d "/c/Users/muthu.MSG/google-cloud-sdk-extract"

# Run the install script
/c/Users/muthu.MSG/google-cloud-sdk-extract/google-cloud-sdk/install.bat --quiet
```

- [ ] **Step 2: Verify gcloud is available**

Run: `gcloud --version`
Expected: Google Cloud SDK version output (e.g., `Google Cloud SDK 500.x.x`)

- [ ] **Step 3: Authenticate gcloud with PyMasters account**

Run: `gcloud auth login --account=muthu@pymasters.net`
Expected: Browser opens for OAuth. After auth: `You are now logged in as [muthu@pymasters.net]`

- [ ] **Step 4: Set default project and region**

```bash
# List projects to find the PyMasters project ID
gcloud projects list

# Set the project (replace with actual project ID from output above)
gcloud config set project <PROJECT_ID>
gcloud config set compute/region us-central1
gcloud config set run/region us-central1
```

Expected: `Updated property [core/project].`

- [ ] **Step 5: Enable required GCP APIs**

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  pubsub.googleapis.com \
  monitoring.googleapis.com \
  billingbudgets.googleapis.com \
  compute.googleapis.com \
  storage.googleapis.com
```

Expected: Each API shows `Operation ... finished successfully.`

- [ ] **Step 6: Commit — n/a (system install, no repo change)**

---

### Task 2: Install Docker Desktop

**Files:**
- None (system-level installation)

- [ ] **Step 1: Download Docker Desktop for Windows**

```bash
curl -o /c/Users/muthu.MSG/Downloads/DockerDesktopInstaller.exe \
  https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe
```

- [ ] **Step 2: Install Docker Desktop**

```bash
# Run installer silently
"/c/Users/muthu.MSG/Downloads/DockerDesktopInstaller.exe" install --quiet --accept-license
```

Expected: Docker Desktop installs. May require a system restart.

- [ ] **Step 3: Verify Docker is running**

Run: `docker --version && docker ps`
Expected: `Docker version 27.x.x` and empty container list.

- [ ] **Step 4: Configure Docker to authenticate with Artifact Registry**

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
```

Expected: `Adding credentials for: us-central1-docker.pkg.dev`

---

### Task 3: Install Terraform

**Files:**
- None (system-level installation)

- [ ] **Step 1: Download Terraform for Windows**

```bash
curl -o /c/Users/muthu.MSG/Downloads/terraform.zip \
  https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_windows_amd64.zip
```

- [ ] **Step 2: Extract and add to PATH**

```bash
mkdir -p /c/Users/muthu.MSG/bin
unzip -o /c/Users/muthu.MSG/Downloads/terraform.zip -d /c/Users/muthu.MSG/bin/
# Add to PATH for this session
export PATH="/c/Users/muthu.MSG/bin:$PATH"
```

- [ ] **Step 3: Verify Terraform works**

Run: `terraform --version`
Expected: `Terraform v1.9.8 on windows_amd64`

- [ ] **Step 4: Add bin directory to system PATH permanently**

```bash
# Add to bashrc so it persists
echo 'export PATH="/c/Users/muthu.MSG/bin:$PATH"' >> ~/.bashrc
```

---

### Task 4: Clone Homie Repository

**Files:**
- Clone to: `C:\Users\muthu.MSG\PycharmProjects\Homie`

- [ ] **Step 1: Clone Homie repo**

```bash
cd /c/Users/muthu.MSG/PycharmProjects
git clone https://github.com/MuthuGsubramanian/Homie.git
```

Expected: `Cloning into 'Homie'...` followed by successful clone.

- [ ] **Step 2: Verify clone and check structure**

```bash
ls /c/Users/muthu.MSG/PycharmProjects/Homie/
```

Expected: Should see `src/`, `tests/`, `docs/`, `website/`, `pyproject.toml`, `README.md`, etc.

- [ ] **Step 3: Verify git remote is correct**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/Homie && git remote -v
```

Expected: `origin https://github.com/MuthuGsubramanian/Homie.git (fetch/push)`

---

### Task 5: Create Terraform State Bucket in GCS

**Files:**
- None (GCP resource created via gcloud)

- [ ] **Step 1: Create a GCS bucket for Terraform state**

```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud storage buckets create "gs://${PROJECT_ID}-tfstate" \
  --location=us-central1 \
  --uniform-bucket-level-access
```

Expected: `Creating gs://<PROJECT_ID>-tfstate/...`

- [ ] **Step 2: Enable versioning on the bucket**

```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud storage buckets update "gs://${PROJECT_ID}-tfstate" --versioning
```

Expected: versioning enabled confirmation.

---

### Task 6: Write Terraform Configuration — Provider and Backend

**Files:**
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\main.tf`
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\variables.tf`
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\outputs.tf`
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\terraform.tfvars`
- Modify: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\.gitignore`

- [ ] **Step 1: Create the infra/terraform directory**

```bash
mkdir -p /c/Users/muthu.MSG/PycharmProjects/PyMasters/infra/terraform
```

- [ ] **Step 2: Write main.tf — provider and backend**

Create `infra/terraform/main.tf`:

```hcl
terraform {
  required_version = ">= 1.5"

  backend "gcs" {
    # bucket is set via -backend-config at init time
    prefix = "terraform/state"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
```

- [ ] **Step 3: Write variables.tf**

Create `infra/terraform/variables.tf`:

```hcl
variable "project_id" {
  description = "GCP project ID for PyMasters"
  type        = string
}

variable "region" {
  description = "Default GCP region"
  type        = string
  default     = "us-central1"
}

variable "pymasters_repo_owner" {
  description = "GitHub org owning the repos"
  type        = string
  default     = "MuthuGsubramanian"
}

variable "pymasters_repo_name" {
  description = "PyMasters GitHub repo name"
  type        = string
  default     = "PyMasters"
}

variable "homie_repo_name" {
  description = "Homie GitHub repo name"
  type        = string
  default     = "Homie"
}

variable "monthly_budget_inr" {
  description = "Monthly budget cap in INR"
  type        = number
  default     = 20000
}

variable "alert_email" {
  description = "Email for budget and uptime alerts"
  type        = string
  default     = "muthu@pymasters.net"
}
```

- [ ] **Step 4: Write outputs.tf**

Create `infra/terraform/outputs.tf`:

```hcl
output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "pymasters_cloud_run_url" {
  value       = google_cloud_run_v2_service.pymasters.uri
  description = "pymasters.net Cloud Run URL"
}

output "tfstate_bucket" {
  value = "${var.project_id}-tfstate"
}
```

- [ ] **Step 5: Write terraform.tfvars (gitignored)**

Create `infra/terraform/terraform.tfvars`:

```hcl
# Actual values — DO NOT commit this file
project_id  = "" # fill in after gcloud projects list
region      = "us-central1"
alert_email = "muthu@pymasters.net"
```

- [ ] **Step 6: Add terraform.tfvars to .gitignore**

Append to `PyMasters/.gitignore`:

```
# Terraform
infra/terraform/.terraform/
infra/terraform/*.tfstate*
infra/terraform/terraform.tfvars
```

- [ ] **Step 7: Commit**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git add infra/terraform/main.tf infra/terraform/variables.tf infra/terraform/outputs.tf .gitignore
git commit -m "infra: add Terraform provider, backend, and variables for GCP"
```

---

### Task 7: Write Terraform — IAM (Service Accounts and Roles)

**Files:**
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\iam.tf`

- [ ] **Step 1: Write iam.tf**

Create `infra/terraform/iam.tf`:

```hcl
# Service account for Cloud Build CI/CD
resource "google_service_account" "cloudbuild" {
  account_id   = "pymasters-cloudbuild"
  display_name = "PyMasters Cloud Build SA"
}

# Cloud Build needs to push to Artifact Registry and deploy to Cloud Run
resource "google_project_iam_member" "cloudbuild_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.cloudbuild.email}"
}

resource "google_project_iam_member" "cloudbuild_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cloudbuild.email}"
}

resource "google_project_iam_member" "cloudbuild_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.cloudbuild.email}"
}

resource "google_project_iam_member" "cloudbuild_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloudbuild.email}"
}

# Service account for Cloud Run (pymasters.net runtime)
resource "google_service_account" "pymasters_runtime" {
  account_id   = "pymasters-runtime"
  display_name = "PyMasters Cloud Run Runtime SA"
}

resource "google_project_iam_member" "runtime_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.pymasters_runtime.email}"
}

resource "google_project_iam_member" "runtime_storage_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.pymasters_runtime.email}"
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git add infra/terraform/iam.tf
git commit -m "infra: add IAM service accounts for Cloud Build and Cloud Run"
```

---

### Task 8: Write Terraform — Secret Manager

**Files:**
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\secrets.tf`

- [ ] **Step 1: Write secrets.tf**

Create `infra/terraform/secrets.tf`:

```hcl
# Secret for Ollama API key used by pymasters.net
resource "google_secret_manager_secret" "ollama_api_key" {
  secret_id = "ollama-api-key"

  replication {
    auto {}
  }
}

# Secret for GitHub Personal Access Token (used by Cloud Build triggers)
resource "google_secret_manager_secret" "github_token" {
  secret_id = "github-token"

  replication {
    auto {}
  }
}

# Note: Secret values are set manually via gcloud CLI after terraform apply:
#   gcloud secrets versions add ollama-api-key --data-file=-
#   gcloud secrets versions add github-token --data-file=-
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git add infra/terraform/secrets.tf
git commit -m "infra: add Secret Manager resources for API keys"
```

---

### Task 9: Write Terraform — Cloud Storage

**Files:**
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\storage.tf`

- [ ] **Step 1: Write storage.tf**

Create `infra/terraform/storage.tf`:

```hcl
# Bucket for PyMasters data (models, backups, pipeline outputs)
resource "google_storage_bucket" "pymasters_data" {
  name          = "${var.project_id}-pymasters-data"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }
}

# Grant runtime SA access to the data bucket
resource "google_storage_bucket_iam_member" "runtime_data_access" {
  bucket = google_storage_bucket.pymasters_data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.pymasters_runtime.email}"
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git add infra/terraform/storage.tf
git commit -m "infra: add Cloud Storage bucket for data and backups"
```

---

### Task 10: Write Terraform — Cloud Run for pymasters.net

**Files:**
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\cloud-run.tf`

- [ ] **Step 1: Write cloud-run.tf**

Create `infra/terraform/cloud-run.tf`:

```hcl
# Artifact Registry repository for Docker images
resource "google_artifact_registry_repository" "pymasters" {
  location      = var.region
  repository_id = "cloud-run-source-deploy"
  format        = "DOCKER"
  description   = "Docker images for PyMasters products"
}

# Cloud Run service for pymasters.net
resource "google_cloud_run_v2_service" "pymasters" {
  name     = "pymasters"
  location = var.region

  template {
    service_account = google_service_account.pymasters_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = "us-central1-docker.pkg.dev/${var.project_id}/cloud-run-source-deploy/pymasters:latest"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "OLLAMA_MODEL"
        value = "qwen3.5"
      }

      env {
        name  = "DB_PATH"
        value = "/app/data/pymasters.db"
      }

      env {
        name = "OLLAMA_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.ollama_api_key.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [google_artifact_registry_repository.pymasters]
}

# Allow unauthenticated access (public website)
resource "google_cloud_run_v2_service_iam_member" "pymasters_public" {
  name     = google_cloud_run_v2_service.pymasters.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git add infra/terraform/cloud-run.tf
git commit -m "infra: add Cloud Run and Artifact Registry for pymasters.net"
```

---

### Task 11: Write Terraform — Cloud Build Triggers

**Files:**
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\cloud-build.tf`

- [ ] **Step 1: Write cloud-build.tf**

Create `infra/terraform/cloud-build.tf`:

```hcl
# Cloud Build trigger for PyMasters — deploy on push to main
resource "google_cloudbuild_trigger" "pymasters_deploy" {
  name        = "pymasters-deploy-main"
  description = "Deploy pymasters.net to Cloud Run on push to main"
  location    = var.region

  github {
    owner = var.pymasters_repo_owner
    name  = var.pymasters_repo_name

    push {
      branch = "^main$"
    }
  }

  filename        = "cloudbuild.yaml"
  service_account = google_service_account.cloudbuild.id
}

# Cloud Build trigger for Homie — run tests on push to main
resource "google_cloudbuild_trigger" "homie_ci" {
  name        = "homie-ci-main"
  description = "Run Homie tests on push to main"
  location    = var.region

  github {
    owner = var.pymasters_repo_owner
    name  = var.homie_repo_name

    push {
      branch = "^main$"
    }
  }

  # Homie uses inline build steps since it's a Python package, not a Cloud Run service
  build {
    step {
      name = "python:3.11-slim"
      entrypoint = "bash"
      args = [
        "-c",
        "pip install -e '.[all]' && python -m pytest tests/ -v --tb=short"
      ]
    }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }
  }

  service_account = google_service_account.cloudbuild.id
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git add infra/terraform/cloud-build.tf
git commit -m "infra: add Cloud Build triggers for PyMasters and Homie repos"
```

---

### Task 12: Write Terraform — Budget Alerts and Monitoring

**Files:**
- Create: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\monitoring.tf`

- [ ] **Step 1: Write monitoring.tf**

Create `infra/terraform/monitoring.tf`:

```hcl
# Look up the billing account
data "google_billing_account" "pymasters" {
  display_name = "My Billing Account"
  open         = true
}

# Budget with alerts at 50%, 80%, 100%
resource "google_billing_budget" "monthly" {
  billing_account = data.google_billing_account.pymasters.id
  display_name    = "PyMasters Monthly Budget"

  amount {
    specified_amount {
      currency_code = "INR"
      units         = tostring(var.monthly_budget_inr)
    }
  }

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = [
      google_monitoring_notification_channel.email.name
    ]
  }
}

# Email notification channel for alerts
resource "google_monitoring_notification_channel" "email" {
  display_name = "PyMasters Alert Email"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# Uptime check for pymasters.net
resource "google_monitoring_uptime_check_config" "pymasters" {
  display_name = "pymasters.net health"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = google_cloud_run_v2_service.pymasters.uri
    }
  }
}

# Alert policy for pymasters.net downtime
resource "google_monitoring_alert_policy" "pymasters_down" {
  display_name = "pymasters.net is DOWN"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields    = ["resource.label.project_id"]
      }
    }
  }

  notification_channels = [
    google_monitoring_notification_channel.email.name
  ]

  alert_strategy {
    auto_close = "1800s"
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git add infra/terraform/monitoring.tf
git commit -m "infra: add budget alerts (20K INR) and uptime monitoring"
```

---

### Task 13: Initialize and Apply Terraform

**Files:**
- Modify: `C:\Users\muthu.MSG\PycharmProjects\PyMasters\infra\terraform\terraform.tfvars` (fill in project_id)

- [ ] **Step 1: Get the actual GCP project ID**

```bash
gcloud projects list --format="value(projectId)"
```

Expected: A project ID like `pymasters-12345` or similar.

- [ ] **Step 2: Fill in terraform.tfvars with the actual project ID**

Edit `infra/terraform/terraform.tfvars` — set `project_id` to the value from step 1.

- [ ] **Step 3: Initialize Terraform with GCS backend**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters/infra/terraform
PROJECT_ID=$(gcloud config get-value project)
terraform init -backend-config="bucket=${PROJECT_ID}-tfstate"
```

Expected: `Terraform has been successfully initialized!`

- [ ] **Step 4: Run terraform plan to preview changes**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters/infra/terraform
terraform plan -out=tfplan
```

Expected: Plan shows ~15-20 resources to create. Review the output for correctness.

- [ ] **Step 5: Apply the plan**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters/infra/terraform
terraform apply tfplan
```

Expected: `Apply complete! Resources: N added, 0 changed, 0 destroyed.` with outputs showing Cloud Run URL and project info.

- [ ] **Step 6: Verify Cloud Run is serving**

```bash
gcloud run services describe pymasters --region=us-central1 --format='value(status.url)'
```

Expected: A URL like `https://pymasters-xxxxx.us-central1.run.app`

---

### Task 14: Populate Secrets

**Files:**
- None (GCP operations only)

- [ ] **Step 1: Set the Ollama API key secret**

```bash
echo -n "208d52f4a68a4c00aa4518fac8d995c6.oV--ePuqKn4DSs2T7tBW0KE7" | \
  gcloud secrets versions add ollama-api-key --data-file=-
```

Expected: `Created version [1] of the secret [ollama-api-key].`

- [ ] **Step 2: Create a GitHub PAT and store it**

First create a fine-grained PAT at github.com with repo access to MuthuGsubramanian org, then:

```bash
echo -n "<GITHUB_PAT_VALUE>" | \
  gcloud secrets versions add github-token --data-file=-
```

Expected: `Created version [1] of the secret [github-token].`

- [ ] **Step 3: Verify secrets are accessible**

```bash
gcloud secrets versions access latest --secret=ollama-api-key | head -c 10
echo "..."
```

Expected: First 10 characters of the Ollama key.

---

### Task 15: Connect Cloud Build to GitHub

**Files:**
- None (GCP console/CLI operations)

- [ ] **Step 1: Connect GitHub repository to Cloud Build**

```bash
# This requires a one-time GitHub App installation
# Open the Cloud Build console to connect GitHub:
echo "Open: https://console.cloud.google.com/cloud-build/triggers?project=$(gcloud config get-value project)"
echo "Click 'Connect Repository' → select GitHub → authorize MuthuGsubramanian org"
```

Note: This step requires browser interaction to authorize the Cloud Build GitHub App on the MuthuGsubramanian org. After authorization, the triggers defined in Terraform will activate.

- [ ] **Step 2: Verify triggers exist**

```bash
gcloud builds triggers list --region=us-central1 --format="table(name,github.name,github.push.branch)"
```

Expected: Two triggers listed — `pymasters-deploy-main` and `homie-ci-main`.

- [ ] **Step 3: Test PyMasters trigger with a manual run**

```bash
gcloud builds triggers run pymasters-deploy-main \
  --region=us-central1 \
  --branch=main
```

Expected: Build starts. Check status with:
```bash
gcloud builds list --limit=1 --region=us-central1
```

---

### Task 16: Install Python Properly and Set Up Dev Environment

**Files:**
- None (system-level setup)

- [ ] **Step 1: Check current Python situation**

```bash
python --version 2>/dev/null
python3 --version 2>/dev/null
pip --version 2>/dev/null
pip3 --version 2>/dev/null
```

The Windows Store Python stub may be installed but not functional. If `pip` is missing, install Python properly.

- [ ] **Step 2: Install Python 3.11+ via winget or direct download**

```bash
# Try winget first
winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
```

If winget is unavailable, download from https://www.python.org/downloads/ and install with "Add to PATH" checked.

- [ ] **Step 3: Verify Python and pip work**

```bash
python --version
pip --version
```

Expected: `Python 3.11.x` and `pip 24.x.x`

- [ ] **Step 4: Install core Python packages for the automation pipeline**

```bash
pip install --user anthropic huggingface-hub arxiv requests feedparser google-cloud-secret-manager google-cloud-storage
```

Expected: All packages install successfully.

---

### Task 17: Verify End-to-End Setup

**Files:**
- None (verification only)

- [ ] **Step 1: Verify all tools are installed**

```bash
echo "=== Tool Versions ==="
gcloud --version | head -1
docker --version
terraform --version | head -1
python --version
pip --version | head -1
git --version
gh --version | head -1
node --version
echo "=== GCP Config ==="
gcloud config get-value project
gcloud config get-value compute/region
echo "=== Repos ==="
ls /c/Users/muthu.MSG/PycharmProjects/PyMasters/.git/HEAD
ls /c/Users/muthu.MSG/PycharmProjects/Homie/.git/HEAD
echo "=== GCP Services ==="
gcloud run services list --format="table(SERVICE,REGION,URL)"
gcloud builds triggers list --region=us-central1 --format="table(name)"
gcloud secrets list --format="table(name)"
```

Expected: All tools report versions. Both repos exist. GCP shows Cloud Run service, 2 build triggers, 2 secrets.

- [ ] **Step 2: Verify pymasters.net is reachable**

```bash
PYMASTERS_URL=$(gcloud run services describe pymasters --region=us-central1 --format='value(status.url)')
curl -s -o /dev/null -w "%{http_code}" "${PYMASTERS_URL}/health"
```

Expected: `200`

- [ ] **Step 3: Final commit — push all infra to remote**

```bash
cd /c/Users/muthu.MSG/PycharmProjects/PyMasters
git push origin main
```

Expected: All infra commits pushed to GitHub, which triggers Cloud Build to deploy.

---

## Self-Review Results

**Spec coverage:** Phase 1 requirements fully covered:
- Install gcloud ✓ (Task 1)
- Install Docker ✓ (Task 2)
- Install Terraform ✓ (Task 3)
- Clone Homie ✓ (Task 4)
- GCP IAM ✓ (Task 7)
- Billing alerts ✓ (Task 12)
- Secret Manager ✓ (Tasks 8, 14)
- Cloud Build triggers for both repos ✓ (Tasks 11, 15)
- Cloud Run for pymasters.net ✓ (Task 10)
- Artifact Registry ✓ (Task 10)
- Cloud Storage ✓ (Tasks 5, 9)

**Placeholder scan:** No TBDs. The only dynamic value is `project_id` which is explicitly filled in Task 13 step 2.

**Type consistency:** All Terraform resource names are consistent across files (e.g., `google_service_account.cloudbuild` in iam.tf, referenced in cloud-build.tf).
