# Artifact Registry repository for Docker images
resource "google_artifact_registry_repository" "pymasters" {
  location      = var.region
  repository_id = "cloud-run-source-deploy"
  format        = "DOCKER"
  description   = "Docker images for PyMasters products"

  # Cost control: every deploy pushes a ~1GB SHA-tagged image; the automation
  # loops deploy many times a day, so untrimmed storage becomes the largest
  # silent cost line. Keep the 5 newest for rollback, delete everything else.
  # (CI also prunes post-deploy; this policy is the backstop.)
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-newest-5"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-older-than-30d"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }
}

# Cloud Run service for pymasters.net
resource "google_cloud_run_v2_service" "pymasters" {
  name     = "pymasters"
  location = var.region

  template {
    service_account = google_service_account.pymasters_runtime.email

    scaling {
      # MUST match .github/workflows/deploy.yml (min=1, max=1).
      # max=1 is a data-integrity requirement, not a cost choice: SQLite lives
      # inside the instance, so a second instance would fork the database
      # (split-brain). min=1 + no CPU throttling keeps Litestream's background
      # GCS replication alive. Do not change without moving off SQLite.
      min_instance_count = 1
      max_instance_count = 1
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

# Public access is configured via Cloud Run console (org policy restricts allUsers via Terraform)
# The existing service already allows unauthenticated access.
