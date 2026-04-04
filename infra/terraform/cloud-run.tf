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
