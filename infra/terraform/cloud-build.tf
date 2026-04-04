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
      name       = "python:3.11-slim"
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
